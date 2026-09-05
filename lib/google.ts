/**
 * Gmail, for creating drafts. Nothing here sends.
 *
 * The recap email is the one piece of this system that speaks to the outside
 * world in Lily's name, so it stops at a draft in her mailbox and she presses
 * send. That is the same boundary the brief emails hold, and it is the reason
 * this file asks for `gmail.compose` rather than `gmail.send`: the credential
 * itself is incapable of sending, so no bug in this repo can send an email.
 *
 * Auth is the OAuth refresh-token flow already used by the Python ingester.
 * Every function no-ops when the three GOOGLE_* vars are unset, so the poller
 * still posts its Slack card in an environment with no Gmail access.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me'

/** Access tokens last an hour; a warm lambda should not mint one per call. */
let cached: { token: string; expiresAt: number } | null = null

export async function accessToken(): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) {
    console.warn('[google] GOOGLE_* not fully set; Gmail drafting disabled')
    return null
  }

  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token

  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) {
      console.error(`[google] token refresh failed: ${res.status} ${await res.text().catch(() => '')}`)
      return null
    }
    const data = (await res.json()) as { access_token?: string; expires_in?: number }
    if (!data.access_token) return null
    cached = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    }
    return cached.token
  } catch (err) {
    console.error('[google] token refresh threw:', err)
    return null
  }
}

async function gmail<T>(
  path: string,
  init?: RequestInit,
): Promise<{ data?: T; error?: string }> {
  const token = await accessToken()
  if (!token) return { error: 'no Google credentials' }

  try {
    const res = await fetch(`${GMAIL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(30_000),
    })
    const text = await res.text()
    if (!res.ok) {
      // The failure everyone hits first: the stored refresh token was granted
      // read-only scopes, so drafts.create returns 403 with a scope message.
      // Say so in those words rather than leaving a bare 403 in the logs.
      const hint = res.status === 403 ? ' (does the refresh token have gmail.compose?)' : ''
      return { error: `${res.status}${hint}: ${text.slice(0, 300)}` }
    }
    return { data: text ? (JSON.parse(text) as T) : (undefined as T) }
  } catch (err) {
    return { error: (err as Error).message }
  }
}

/** RFC 2047, for the display names and subjects that are not plain ASCII. */
function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
}

export interface ExistingThread {
  threadId: string
  /** The RFC822 Message-ID of the newest message, for In-Reply-To. */
  messageId: string | null
  subject: string | null
}

/**
 * A previous Refery thread with this person, or null to start a fresh one.
 *
 * Deliberately narrow. The obvious implementation, "the most recent thread with
 * this address", is wrong in a way that only shows up in production: the newest
 * thread with someone we just spoke to is almost always the Google Calendar
 * invitation for the call itself, and threading a recap into
 * "Updated invitation: Lily and Bryan Lee @ Wed Sep 2" makes it look like a
 * calendar notification and buries it. That is exactly what happened the first
 * time this ran.
 *
 * Matching on the `[Refery]` subject also matches what Lily already does by
 * hand: a first recap starts its own thread, and a second one continues it.
 */
const CALENDAR_SUBJECT =
  /^(re:\s*)?(invitation|updated invitation|accepted|declined|tentative|cancell?ed|new time proposed):/i

/**
 * The shape of a recap subject: `[Refery] Devangi Doshi / Lily :)`.
 *
 * Required as well as the calendar exclusion, because `[Refery]` alone also
 * matches broadcasts like "[Refery] Pin.com x Refery: a little gift for our
 * friends" that went to a wide list. Threading a personal recap onto a
 * marketing send would be the worst possible place for it.
 */
const RECAP_SUBJECT = /\[Refery\].*\/\s*Lily/i

export async function findThread(email: string): Promise<ExistingThread | null> {
  const query = encodeURIComponent(`to:${email} from:me subject:"[Refery]" -in:chats -in:draft`)
  const list = await gmail<{ threads?: { id: string }[] }>(`/threads?q=${query}&maxResults=3`)

  for (const candidate of list.data?.threads ?? []) {
    const thread = await gmail<{
      messages?: { id: string; payload?: { headers?: { name: string; value: string }[] } }[]
    }>(`/threads/${candidate.id}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=Subject`)

    const messages = thread.data?.messages ?? []
    const last = messages[messages.length - 1]
    const headers = last?.payload?.headers ?? []
    const header = (name: string) =>
      headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? null

    const subject = header('Subject')
    // Belt and braces: the subject filter above should already exclude these,
    // but a calendar invite carrying "[Refery]" in its title would slip past.
    if (!subject || CALENDAR_SUBJECT.test(subject)) continue
    if (!RECAP_SUBJECT.test(subject)) continue

    return { threadId: candidate.id, messageId: header('Message-ID'), subject }
  }

  return null
}

export interface DraftInput {
  to: string
  toName?: string | null
  subject: string
  body: string
  thread?: ExistingThread | null
}

export interface DraftResult {
  draftId?: string
  threadId?: string
  subject: string
  error?: string
}

/**
 * Create a Gmail draft. Never sends.
 *
 * When an existing thread is supplied the draft joins it, which Gmail only
 * honours if the subject matches the thread's and the reply headers are set.
 * Getting either wrong silently produces a new conversation, which looks like
 * the drafting worked and reads to the recipient as though we lost the plot.
 */
export async function createDraft(input: DraftInput): Promise<DraftResult> {
  const thread = input.thread
  const subject = thread?.subject
    ? /^re:\s/i.test(thread.subject)
      ? thread.subject
      : `Re: ${thread.subject}`
    : input.subject

  const to = input.toName
    ? `${encodeHeader(input.toName)} <${input.to}>`
    : input.to

  const headers = [
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
  ]

  if (thread?.messageId) {
    headers.push(`In-Reply-To: ${thread.messageId}`, `References: ${thread.messageId}`)
  }

  const raw = Buffer.from(`${headers.join('\r\n')}\r\n\r\n${input.body}`, 'utf8').toString(
    'base64url',
  )

  const res = await gmail<{ id?: string; message?: { threadId?: string } }>('/drafts', {
    method: 'POST',
    body: JSON.stringify({
      message: thread?.threadId ? { raw, threadId: thread.threadId } : { raw },
    }),
  })

  if (res.error) return { subject, error: res.error }
  return {
    draftId: res.data?.id,
    threadId: res.data?.message?.threadId,
    subject,
  }
}

/** Where Lily opens the draft from the Slack card. */
export function draftUrl(draftId: string): string {
  return `https://mail.google.com/mail/u/0/#drafts?compose=${draftId}`
}
