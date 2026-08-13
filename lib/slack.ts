/**
 * Slack notifications for the super admin.
 *
 * Posts to an Incoming Webhook set as SLACK_WEBHOOK_URL. If that is not set,
 * every call is a silent no-op: notifications are an observability nicety and
 * must never fail the request that triggered them.
 */

/**
 * Notifications are grouped by who they are about, because the useful reaction
 * differs: a client opening an agreement wants a same-day reply, a candidate
 * upload wants a look when convenient.
 *
 * Each stream reads its own webhook and falls back to SLACK_WEBHOOK_URL, so a
 * single webhook still receives everything until the channels exist.
 */
export type SlackStream = 'clients' | 'partners' | 'candidates' | 'daily'

const STREAM_ENV: Record<SlackStream, string> = {
  clients: 'SLACK_WEBHOOK_CLIENTS',
  partners: 'SLACK_WEBHOOK_PARTNERS',
  candidates: 'SLACK_WEBHOOK_CANDIDATES',
  daily: 'SLACK_WEBHOOK_DAILY',
}

function webhookFor(stream?: SlackStream): string {
  const fallback = process.env.SLACK_WEBHOOK_URL || ''
  if (!stream) return fallback
  return process.env[STREAM_ENV[stream]] || fallback
}

export interface SlackField {
  label: string
  value: string
}

export interface SlackNotification {
  /** Bold first line, e.g. "New scout sign-up: Jane Doe". */
  title: string
  /** One sentence of interpretation, telling the reader what to do about it. */
  context?: string
  fields?: SlackField[]
  /** Rendered as a quoted block under the fields. */
  body?: string
  links?: { label: string; url: string }[]
  /** Emoji shown before the title, e.g. ":inbox_tray:". */
  emoji?: string
  /** Which channel this belongs to. Falls back to the single shared webhook. */
  stream?: SlackStream
}

function truncate(s: string, n: number): string {
  const clean = s.replace(/\s+/g, ' ').trim()
  return clean.length > n ? `${clean.slice(0, n - 1)}...` : clean
}

/** Slack mrkdwn escaping. Only these three are special. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function notifySlack(n: SlackNotification): Promise<{ sent: boolean; error?: string }> {
  const url = webhookFor(n.stream)
  if (!url) {
    // Loud on purpose. A notification that goes nowhere and says nothing is
    // indistinguishable from one that was never triggered, which makes a
    // misconfigured webhook impossible to diagnose from the outside.
    const wanted = n.stream ? STREAM_ENV[n.stream] : 'SLACK_WEBHOOK_URL'
    console.warn(
      `[slack] skipped "${n.title}": neither ${wanted} nor SLACK_WEBHOOK_URL is set in this environment`,
    )
    return { sent: false, error: `${wanted} not set` }
  }

  const blocks: unknown[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${n.emoji ? `${n.emoji} ` : ''}*${esc(truncate(n.title, 200))}*`,
      },
    },
  ]

  if (n.fields?.length) {
    // Slack renders at most 10 fields, two per row.
    blocks.push({
      type: 'section',
      fields: n.fields.slice(0, 10).map((f) => ({
        type: 'mrkdwn',
        text: `*${esc(f.label)}*\n${esc(truncate(f.value, 300))}`,
      })),
    })
  }

  if (n.body) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `>${esc(truncate(n.body, 2500)).replace(/\n/g, '\n>')}` },
    })
  }

  if (n.context) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: esc(truncate(n.context, 300)) }],
    })
  }

  if (n.links?.length) {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: n.links.map((l) => `<${l.url}|${esc(l.label)}>`).join('  ·  '),
        },
      ],
    })
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: truncate(n.title, 200), blocks }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      // Slack answers with a plain-text reason such as "no_service" for a
      // revoked webhook or "channel_not_found" for a deleted channel.
      console.error(`[slack] ${n.stream ?? 'default'} post failed: ${res.status} ${detail}`)
      return { sent: false, error: `${res.status} ${detail}` }
    }
    return { sent: true }
  } catch (err) {
    console.error('[slack] threw:', err)
    return { sent: false, error: (err as Error).message }
  }
}
