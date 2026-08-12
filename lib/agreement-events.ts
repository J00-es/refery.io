import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Activity log for client agreement signing links. This is the audit trail an admin
 * sees ("viewed 3 times, first on Aug 12 from an iPhone in..."), and the
 * trigger for the real-time notification email.
 *
 * Every write is best-effort: an audit-log failure must never break signing.
 */

export type AgreementEventType =
  | 'created'
  | 'viewed'
  | 'signed'
  | 'revoked'
  | 'expired'
  | 'downloaded'
  | 'reminder_sent'

export interface AgreementEvent {
  id: string
  link_id: string
  company_id: string | null
  event_type: AgreementEventType
  occurred_at: string
  ip_address: string | null
  user_agent: string | null
  device: string | null
  seq: number
  metadata: Record<string, unknown>
}

// Repeat views from the same reader within this window collapse into one event.
// A page refresh or a second tab is not a new "open", and shouldn't fire an
// email. 30 minutes is roughly one reading session.
const VIEW_DEDUPE_MINUTES = 30

/**
 * Human-readable device string from a user-agent. Deliberately coarse, since this
 * is for "opened on an iPhone", not fingerprinting.
 */
export function describeDevice(userAgent: string | null): string | null {
  if (!userAgent) return null
  const ua = userAgent.toLowerCase()

  let os = 'Unknown device'
  if (ua.includes('iphone')) os = 'iPhone'
  else if (ua.includes('ipad')) os = 'iPad'
  else if (ua.includes('android')) os = 'Android'
  else if (ua.includes('mac os') || ua.includes('macintosh')) os = 'Mac'
  else if (ua.includes('windows')) os = 'Windows'
  else if (ua.includes('linux')) os = 'Linux'

  let browser = ''
  if (ua.includes('edg/')) browser = 'Edge'
  else if (ua.includes('chrome/') && !ua.includes('chromium')) browser = 'Chrome'
  else if (ua.includes('safari/') && !ua.includes('chrome')) browser = 'Safari'
  else if (ua.includes('firefox/')) browser = 'Firefox'

  return browser ? `${os} · ${browser}` : os
}

/** True when the user agent looks like a bot, link scanner, or email preview fetch. */
export function isLikelyBot(userAgent: string | null): boolean {
  if (!userAgent) return true
  return /bot|crawler|spider|slurp|preview|fetch|curl|wget|python-requests|headless|monitor|scan|proofpoint|barracuda|mimecast|outlook-ios|googleimageproxy/i.test(
    userAgent,
  )
}

interface LogArgs {
  linkId: string
  companyId?: string | null
  eventType: AgreementEventType
  ipAddress?: string | null
  userAgent?: string | null
  metadata?: Record<string, unknown>
}

export interface LoggedEvent {
  logged: boolean
  seq: number
  device: string | null
}

/**
 * Append an event. Returns `logged: false` when the event was deduped, so the
 * caller knows not to send a notification.
 */
export async function logAgreementEvent(
  admin: SupabaseClient,
  args: LogArgs,
): Promise<LoggedEvent> {
  const device = describeDevice(args.userAgent ?? null)

  try {
    // Views collapse per reader per window; everything else always logs.
    if (args.eventType === 'viewed') {
      const since = new Date(Date.now() - VIEW_DEDUPE_MINUTES * 60_000).toISOString()
      const { data: recent } = await admin
        .from('client_agreement_events')
        .select('id')
        .eq('link_id', args.linkId)
        .eq('event_type', 'viewed')
        .eq('ip_address', args.ipAddress ?? '')
        .gte('occurred_at', since)
        .limit(1)

      if (recent && recent.length > 0) {
        return { logged: false, seq: 0, device }
      }
    }

    const { count } = await admin
      .from('client_agreement_events')
      .select('id', { count: 'exact', head: true })
      .eq('link_id', args.linkId)
      .eq('event_type', args.eventType)

    const seq = (count ?? 0) + 1

    const { error } = await admin.from('client_agreement_events').insert({
      link_id: args.linkId,
      company_id: args.companyId ?? null,
      event_type: args.eventType,
      ip_address: args.ipAddress ?? null,
      user_agent: args.userAgent ?? null,
      device,
      seq,
      metadata: args.metadata ?? {},
    })

    if (error) {
      console.error('[agreement-events] insert failed:', error)
      return { logged: false, seq: 0, device }
    }

    return { logged: true, seq, device }
  } catch (err) {
    console.error('[agreement-events] threw:', err)
    return { logged: false, seq: 0, device }
  }
}

/** Ordinal for display: 1 -> "1st", 2 -> "2nd", 11 -> "11th". */
export function ordinal(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

/** One-line description of an event for the timeline and the alert email. */
export function describeEvent(event: {
  event_type: AgreementEventType
  seq: number
  device: string | null
}): string {
  switch (event.event_type) {
    case 'created':
      return 'Link created'
    case 'viewed':
      return event.seq === 1 ? 'Opened for the first time' : `Opened again (${ordinal(event.seq)} time)`
    case 'signed':
      return 'Signed'
    case 'revoked':
      return 'Link revoked'
    case 'expired':
      return 'Link expired'
    case 'downloaded':
      return 'PDF downloaded'
    case 'reminder_sent':
      return 'Reminder sent'
    default:
      return event.event_type
  }
}
