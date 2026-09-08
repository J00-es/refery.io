/**
 * Getting a founder into Slack with Lily, from an email address.
 *
 * Two paths, chosen at runtime by what the Refery Ops app is allowed to do:
 *
 *   invited   The app holds `channels:manage` and `conversations.connect:write`.
 *             We find or create the client's channel (`#<company>-refery`, the
 *             shape Lily already uses by hand), put Lily in it, and ask Slack to
 *             send the email a Slack Connect invitation to that channel.
 *
 *   manual    The app lacks a scope, or Slack refuses (free plan, external
 *             invites off). We DM Lily the email with the exact steps, and the
 *             founder is told Lily will send it. Nothing is lost; it is just
 *             one more thing on Lily's plate until the scopes are granted.
 *
 * Today (2026-09-08) the app has chat:write, channels:read/history, groups:*,
 * users:read and reactions:*, so every request lands on the manual path until
 * the app is reinstalled with the two extra scopes. The code below already
 * takes the invited path the moment it can.
 */

import { esc } from '@/lib/slack-bot'

const SLACK_API = 'https://slack.com/api'

/** Lily's Slack user id. The bot DMs this user; env overrides for a different workspace. */
export function lilySlackUserId(): string {
  return process.env.SLACK_LILY_USER_ID || 'U0B48URCL73'
}

interface SlackResult {
  ok: boolean
  error?: string
  needed?: string
  [k: string]: unknown
}

async function slack(method: string, body: Record<string, unknown>): Promise<SlackResult> {
  const token = process.env.SLACK_BOT_TOKEN || ''
  if (!token) return { ok: false, error: 'SLACK_BOT_TOKEN not set' }
  try {
    const res = await fetch(`${SLACK_API}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    return (await res.json()) as SlackResult
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/** "#livo-refery": lower-case, hyphens, Slack's 80-char limit. */
export function clientChannelName(companyName: string): string {
  const base = companyName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${base || 'client'}-refery`
}

async function findChannel(name: string): Promise<{ id: string; name: string } | null> {
  let cursor: string | undefined
  for (let page = 0; page < 10; page++) {
    const res = await slack('conversations.list', {
      types: 'public_channel,private_channel',
      exclude_archived: true,
      limit: 200,
      cursor,
    })
    if (!res.ok) return null
    const channels = (res.channels as { id: string; name: string }[]) ?? []
    const hit = channels.find(c => c.name === name)
    if (hit) return hit
    cursor = (res.response_metadata as { next_cursor?: string } | undefined)?.next_cursor || undefined
    if (!cursor) break
  }
  return null
}

export interface InviteOutcome {
  mode: 'invited' | 'manual'
  channelId: string | null
  channelName: string | null
  detail: string | null
}

/**
 * Tries the Slack Connect path and falls back to telling Lily.
 * Never throws: a founder pressing "Invite me" must always get a true answer.
 */
export async function inviteToSlackWithLily(input: {
  companyName: string
  email: string
  requestedBy: string | null
  briefUrl: string
  /**
   * Partners get a private `#<name>-refery` room rather than the public client
   * channel, and the link Lily sees points at their profile, not a brief.
   */
  isPrivate?: boolean
  linkLabel?: string
}): Promise<InviteOutcome> {
  const name = clientChannelName(input.companyName)
  const linkLabel = input.linkLabel ?? 'Open the brief'
  let detail: string | null = null

  // ── invited path ────────────────────────────────────────────────────────
  const existing = await findChannel(name)
  let channel = existing
  if (!channel) {
    const created = await slack('conversations.create', { name, is_private: Boolean(input.isPrivate) })
    if (created.ok) {
      const c = created.channel as { id: string; name: string }
      channel = { id: c.id, name: c.name }
    } else {
      detail = `conversations.create: ${created.error}${created.needed ? ` (needs ${created.needed})` : ''}`
    }
  }

  if (channel) {
    // Lily in the channel first, so the founder never lands in an empty room.
    await slack('conversations.invite', { channel: channel.id, users: lilySlackUserId() })
    const shared = await slack('conversations.inviteShared', { channel: channel.id, emails: [input.email], external_limited: false })
    if (shared.ok) {
      await dmLily(
        `:handshake: *${esc(input.companyName)}*: Slack Connect invitation sent to ${esc(input.email)}${input.requestedBy ? ` (requested by ${esc(input.requestedBy)})` : ''} for #${channel.name}. They accept from their inbox and land in the channel with you.\n<${input.briefUrl}|${esc(linkLabel)}>`,
      )
      return { mode: 'invited', channelId: channel.id, channelName: channel.name, detail: null }
    }
    detail = `conversations.inviteShared: ${shared.error}${shared.needed ? ` (needs ${shared.needed})` : ''}`
  }

  // ── manual path ─────────────────────────────────────────────────────────
  const steps = channel
    ? `Open #${channel.name} → channel name → *Share channel* (Slack Connect) → enter the email.`
    : `Create #${name} (or open your DM), then *Share channel* (Slack Connect) → enter the email. Or Invite people → by email.`
  await dmLily(
    `:email: *${esc(input.companyName)}* asked for Slack access: *${esc(input.email)}*${input.requestedBy ? ` (${esc(input.requestedBy)})` : ''}.\nThe app could not send the invitation itself (${esc(detail ?? 'no Slack Connect scope')}), so please send it by hand: ${steps}\nThey were told you will send it shortly.\n<${input.briefUrl}|${esc(linkLabel)}>`,
  )
  return { mode: 'manual', channelId: channel?.id ?? null, channelName: channel?.name ?? null, detail }
}

async function dmLily(text: string) {
  const res = await slack('chat.postMessage', { channel: lilySlackUserId(), text, unfurl_links: false })
  if (!res.ok) console.error('[slack-connect] DM to Lily failed:', res.error)
}
