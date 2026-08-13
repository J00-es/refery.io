/**
 * Slack notifications for the super admin.
 *
 * Posts to an Incoming Webhook set as SLACK_WEBHOOK_URL. If that is not set,
 * every call is a silent no-op: notifications are an observability nicety and
 * must never fail the request that triggered them.
 */

const WEBHOOK = () => process.env.SLACK_WEBHOOK_URL || ''

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
  const url = WEBHOOK()
  if (!url) return { sent: false, error: 'SLACK_WEBHOOK_URL not set' }

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
      console.error('[slack] post failed:', res.status, detail)
      return { sent: false, error: `${res.status} ${detail}` }
    }
    return { sent: true }
  } catch (err) {
    console.error('[slack] threw:', err)
    return { sent: false, error: (err as Error).message }
  }
}
