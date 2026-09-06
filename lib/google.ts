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

// ── Sending and reading, for the candidate desk ──────────────────────────────
//
// The boundary above ("nothing here sends") held while every outbound email
// was a recap Lily edited by hand. The desk changes that on purpose: a
// reaction on a card is the send. The credential therefore needs gmail.send
// and gmail.readonly as well as gmail.compose, and each function below says
// so in its error when the token was minted without them.

export interface SendInput {
  to: string
  toName?: string | null
  cc?: string[]
  subject: string
  body: string
  /** Reply into this thread. Subject is normalised to Re: on its own. */
  thread?: { threadId: string; messageId: string | null; subject?: string | null } | null
}

export interface SendResult {
  messageId?: string
  threadId?: string
  subject: string
  error?: string
}

function rawMessage(input: SendInput): { raw: string; subject: string } {
  const thread = input.thread
  const subject = thread?.subject
    ? /^re:\s/i.test(thread.subject)
      ? thread.subject
      : `Re: ${thread.subject}`
    : input.subject

  const to = input.toName ? `${encodeHeader(input.toName)} <${input.to}>` : input.to
  const headers = [
    `To: ${to}`,
    ...(input.cc?.length ? [`Cc: ${input.cc.join(', ')}`] : []),
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
  ]
  if (thread?.messageId) {
    headers.push(`In-Reply-To: ${thread.messageId}`, `References: ${thread.messageId}`)
  }
  const raw = Buffer.from(`${headers.join('\r\n')}\r\n\r\n${input.body}`, 'utf8').toString('base64url')
  return { raw, subject }
}

/** Send as the authorised mailbox (lily@refery.io). Needs gmail.send. */
export async function sendMessage(input: SendInput): Promise<SendResult> {
  const { raw, subject } = rawMessage(input)
  const res = await gmail<{ id?: string; threadId?: string }>('/messages/send', {
    method: 'POST',
    body: JSON.stringify(input.thread?.threadId ? { raw, threadId: input.thread.threadId } : { raw }),
  })
  if (res.error) {
    const hint = /403/.test(res.error) ? ' (the refresh token needs gmail.send; re-authorise once)' : ''
    return { subject, error: `${res.error}${hint}` }
  }
  return { messageId: res.data?.id, threadId: res.data?.threadId, subject }
}

export interface GmailMessageMeta {
  id: string
  threadId: string
  from: string
  to: string
  cc: string
  subject: string
  date: string
  messageId: string | null
  snippet: string
  /** Unix ms, from Gmail's internalDate. */
  internalDate: number
}

function headerOf(headers: { name: string; value: string }[] | undefined, name: string): string {
  return headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

/** Search the mailbox. Needs gmail.readonly. Returns newest first. */
export async function searchMessages(query: string, max = 10): Promise<{ messages: GmailMessageMeta[]; error?: string }> {
  const list = await gmail<{ messages?: { id: string; threadId: string }[] }>(
    `/messages?q=${encodeURIComponent(query)}&maxResults=${max}`,
  )
  if (list.error) return { messages: [], error: list.error }
  const out: GmailMessageMeta[] = []
  for (const m of list.data?.messages ?? []) {
    const meta = await getMessageMeta(m.id)
    if (meta) out.push(meta)
  }
  out.sort((a, b) => b.internalDate - a.internalDate)
  return { messages: out }
}

export async function getMessageMeta(id: string): Promise<GmailMessageMeta | null> {
  const res = await gmail<{
    id: string
    threadId: string
    snippet?: string
    internalDate?: string
    payload?: { headers?: { name: string; value: string }[] }
  }>(`/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=Message-ID`)
  if (res.error || !res.data) return null
  const h = res.data.payload?.headers
  return {
    id: res.data.id,
    threadId: res.data.threadId,
    from: headerOf(h, 'From'),
    to: headerOf(h, 'To'),
    cc: headerOf(h, 'Cc'),
    subject: headerOf(h, 'Subject'),
    date: headerOf(h, 'Date'),
    messageId: headerOf(h, 'Message-ID') || null,
    snippet: res.data.snippet ?? '',
    internalDate: Number(res.data.internalDate ?? 0),
  }
}

/** Every message in a thread, oldest first, with a plain-text body where one exists. */
export async function threadMessages(
  threadId: string,
): Promise<{ messages: (GmailMessageMeta & { text: string })[]; error?: string }> {
  const res = await gmail<{
    messages?: {
      id: string
      threadId: string
      snippet?: string
      internalDate?: string
      payload?: { headers?: { name: string; value: string }[]; mimeType?: string; body?: { data?: string }; parts?: unknown[] }
    }[]
  }>(`/threads/${threadId}?format=full`)
  if (res.error) return { messages: [], error: res.error }

  const decode = (data?: string) => (data ? Buffer.from(data, 'base64url').toString('utf8') : '')
  const textOf = (payload: { mimeType?: string; body?: { data?: string }; parts?: unknown[] } | undefined): string => {
    if (!payload) return ''
    if (payload.mimeType === 'text/plain' && payload.body?.data) return decode(payload.body.data)
    for (const part of (payload.parts ?? []) as { mimeType?: string; body?: { data?: string }; parts?: unknown[] }[]) {
      const t = textOf(part)
      if (t) return t
    }
    return ''
  }

  const messages = (res.data?.messages ?? []).map(m => {
    const h = m.payload?.headers
    return {
      id: m.id,
      threadId: m.threadId,
      from: headerOf(h, 'From'),
      to: headerOf(h, 'To'),
      cc: headerOf(h, 'Cc'),
      subject: headerOf(h, 'Subject'),
      date: headerOf(h, 'Date'),
      messageId: headerOf(h, 'Message-ID') || null,
      snippet: m.snippet ?? '',
      internalDate: Number(m.internalDate ?? 0),
      // Quoted history is stripped so a classifier reads the reply, not the ask.
      text: textOf(m.payload).split(/\r?\n(On .+wrote:|>)/)[0].trim().slice(0, 4000),
    }
  })
  messages.sort((a, b) => a.internalDate - b.internalDate)
  return { messages }
}

/** "Lily Joo <lily@refery.io>" → "lily@refery.io". */
export function addressOf(header: string): string {
  const m = header.match(/<([^>]+)>/)
  return (m ? m[1] : header).trim().toLowerCase()
}

/** The mailbox this credential sends from. Cached like the token. */
let cachedSelf: string | null = null
export async function selfAddress(): Promise<string> {
  if (cachedSelf) return cachedSelf
  const res = await gmail<{ emailAddress?: string }>('/profile')
  cachedSelf = (res.data?.emailAddress ?? 'lily@refery.io').toLowerCase()
  return cachedSelf
}
