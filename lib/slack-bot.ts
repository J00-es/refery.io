/**
 * Slack Web API client for the "Refery Ops" bot.
 *
 * Distinct from lib/slack.ts, which posts through Incoming Webhooks. A webhook
 * is fire-and-forget: it returns no message timestamp, so nothing downstream
 * can ever refer back to the message it created. Triage by reaction needs
 * exactly that reference, which means a bot token and chat.postMessage.
 *
 * Both mechanisms stay: webhooks remain the right tool for the streams nobody
 * acts on from Slack.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

const SLACK_API = 'https://slack.com/api'

/** How far a delivery's timestamp may drift before it is treated as a replay. */
export const SLACK_TOLERANCE_SECONDS = 5 * 60

export type SlackBlock = Record<string, unknown>

function botToken(): string {
  return process.env.SLACK_BOT_TOKEN || ''
}

interface SlackApiResult {
  ok: boolean
  error?: string
  ts?: string
  channel?: string
  [k: string]: unknown
}

async function call(method: string, body: Record<string, unknown>): Promise<SlackApiResult> {
  const token = botToken()
  if (!token) {
    console.warn(`[slack-bot] ${method} skipped: SLACK_BOT_TOKEN is not set`)
    return { ok: false, error: 'SLACK_BOT_TOKEN not set' }
  }

  try {
    const res = await fetch(`${SLACK_API}/${method}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })
    const data = (await res.json()) as SlackApiResult
    if (!data.ok) {
      // `not_in_channel` is the one failure that looks like a code bug but is
      // really a setup step: the bot has to be invited to each private channel.
      console.error(`[slack-bot] ${method} failed: ${data.error}`)
    }
    return data
  } catch (err) {
    console.error(`[slack-bot] ${method} threw:`, err)
    return { ok: false, error: (err as Error).message }
  }
}

export async function postMessage(
  channel: string,
  text: string,
  blocks: SlackBlock[],
): Promise<{ ok: boolean; ts?: string; channel?: string; error?: string }> {
  const res = await call('chat.postMessage', { channel, text, blocks, unfurl_links: false })
  return { ok: res.ok, ts: res.ts, channel: res.channel, error: res.error }
}

/** Replies in-thread so the channel stays one message per applicant. */
export async function postThreadReply(
  channel: string,
  threadTs: string,
  text: string,
): Promise<{ ok: boolean; ts?: string; error?: string }> {
  const res = await call('chat.postMessage', { channel, thread_ts: threadTs, text })
  // `ts` is returned so a reply can itself be reacted to later, which is how
  // Pep's draft under a question gets its :+1:.
  return { ok: res.ok, ts: res.ts, error: res.error }
}

export async function addReaction(
  channel: string,
  ts: string,
  name: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await call('reactions.add', { channel, timestamp: ts, name })
  // Re-running a handler should not look like a failure, and this is the only
  // way the same reaction gets added twice.
  if (!res.ok && res.error === 'already_reacted') return { ok: true }
  return { ok: res.ok, error: res.error }
}

/**
 * This app's own bot user ID, memoised for the life of the instance.
 *
 * Needed because a reaction added by the bot arrives as a reaction_added event
 * with `user` set to the bot's own user ID and no `bot_id` field at all. There
 * is no way to tell it apart from a human reaction without knowing this value,
 * and the pre-seeded :+1: on every message means getting it wrong sends the
 * applicant an email nobody approved.
 */
let cachedBotUserId: string | null = null

export async function botUserId(): Promise<string | null> {
  if (cachedBotUserId) return cachedBotUserId
  const res = await call('auth.test', {})
  if (!res.ok || typeof res.user_id !== 'string') return null
  cachedBotUserId = res.user_id
  return cachedBotUserId
}

/**
 * Verifies Slack's v0 request signature.
 *
 * Returns null when the delivery is authentic, or a short reason when it is
 * not. Without this the endpoint would let anyone on the internet trigger
 * outbound email to an applicant, so a missing secret fails closed rather than
 * waving the request through.
 */
export function verifySlackSignature(
  signature: string | null,
  timestamp: string | null,
  rawBody: string,
  secret: string,
  now: number = Date.now(),
): string | null {
  if (!secret) return 'SLACK_SIGNING_SECRET not set'
  if (!signature || !timestamp) return 'missing signature headers'

  const sentAt = Number(timestamp)
  if (!Number.isFinite(sentAt)) return 'malformed timestamp'
  if (Math.abs(now / 1000 - sentAt) > SLACK_TOLERANCE_SECONDS) return 'timestamp outside tolerance'

  const expected = `v0=${createHmac('sha256', secret)
    .update(`v0:${timestamp}:${rawBody}`)
    .digest('hex')}`

  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return 'signature mismatch'

  return null
}

/** Slack mrkdwn escaping. Only these three are special. */
export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
