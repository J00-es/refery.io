import { NextRequest, NextResponse, after } from 'next/server'
import { verifyResendSignature } from '@/lib/resend-webhook'
import {
  ingestInboundResume,
  parseFromHeader,
  type InboundAttachment,
  type InboundEmail,
} from '@/lib/inbound-resume'

/**
 * Resend inbound webhook: résumés that arrive as email attachments.
 *
 * Wired to the `email.received` event. A Gmail filter auto-forwards anything
 * with an attachment to the receiving address, Resend accepts it and calls
 * here, and `lib/inbound-resume` turns each PDF into a candidate.
 *
 * Reading a dense CV can take a couple of minutes, which is far longer than a
 * webhook may block — Resend treats a slow or non-2xx response as a failure and
 * redelivers. So the handler validates, acknowledges, and does the actual work
 * in `after()`. The (email, attachment) unique index makes the redelivery that
 * still occasionally happens harmless.
 */
export const maxDuration = 300

interface ResendAttachmentMeta {
  id: string
  filename: string
  content_type: string | null
  content_disposition?: string | null
  size?: number | null
  download_url: string
  expires_at?: string
}

/** Svix sends these; the `webhook-*` spellings are the unbranded aliases. */
function signatureHeaders(req: NextRequest) {
  return {
    id: req.headers.get('svix-id') || req.headers.get('webhook-id'),
    timestamp: req.headers.get('svix-timestamp') || req.headers.get('webhook-timestamp'),
    signature: req.headers.get('svix-signature') || req.headers.get('webhook-signature'),
  }
}

async function listAttachments(emailId: string, apiKey: string): Promise<ResendAttachmentMeta[]> {
  const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}/attachments`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  if (!res.ok) {
    throw new Error(`attachment list failed: ${res.status} ${await res.text().catch(() => '')}`)
  }

  const body = (await res.json()) as { data?: ResendAttachmentMeta[] }
  return body.data ?? []
}

export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET
  const apiKey = process.env.RESEND_API_KEY

  if (!secret || !apiKey) {
    console.error('[inbound-resume] RESEND_INBOUND_WEBHOOK_SECRET or RESEND_API_KEY is not set')
    return NextResponse.json({ error: 'Inbound ingestion is not configured' }, { status: 503 })
  }

  const rawBody = await request.text()

  const signatureError = verifyResendSignature(signatureHeaders(request), rawBody, secret)
  if (signatureError) {
    console.warn(`[inbound-resume] rejected delivery: ${signatureError}`)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let event: { type?: string; data?: Record<string, unknown> }
  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Malformed JSON' }, { status: 400 })
  }

  if (event.type !== 'email.received') {
    // Other event types are legitimate deliveries we simply have no use for;
    // 200 stops Resend retrying them.
    return NextResponse.json({ ok: true, ignored: event.type ?? 'unknown' })
  }

  const data = event.data ?? {}
  const emailId = typeof data.email_id === 'string' ? data.email_id : null
  if (!emailId) {
    return NextResponse.json({ error: 'Missing email_id' }, { status: 400 })
  }

  const { email: fromEmail, name: fromName } = parseFromHeader(
    typeof data.from === 'string' ? data.from : null,
  )

  const email: InboundEmail = {
    providerEmailId: emailId,
    messageId: typeof data.message_id === 'string' ? data.message_id : null,
    fromEmail,
    fromName,
    subject: typeof data.subject === 'string' ? data.subject : null,
    receivedAt: typeof data.created_at === 'string' ? data.created_at : null,
    origin: process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin,
  }

  // The webhook carries attachment metadata but never the bytes, and the
  // download URLs live on a separate endpoint — deliberately, so that a large
  // CV does not have to fit in a webhook body.
  const pdfs = ((data.attachments as ResendAttachmentMeta[] | undefined) ?? []).filter(
    a => a.content_type === 'application/pdf' || /\.pdf$/i.test(a.filename ?? ''),
  )

  if (!pdfs.length) {
    return NextResponse.json({ ok: true, attachments: 0 })
  }

  after(async () => {
    try {
      const withUrls = await listAttachments(emailId, apiKey)
      const byId = new Map(withUrls.map(a => [a.id, a]))

      for (const meta of pdfs) {
        const full = byId.get(meta.id)
        if (!full?.download_url) {
          console.warn(`[inbound-resume] no download URL for ${meta.filename} on ${emailId}`)
          continue
        }

        const attachment: InboundAttachment = {
          id: full.id,
          filename: full.filename || meta.filename || 'resume.pdf',
          contentType: full.content_type ?? meta.content_type ?? null,
          downloadUrl: full.download_url,
          size: full.size ?? null,
        }

        // Sequential on purpose. A single email rarely carries more than two or
        // three CVs, and each extraction is a multi-second model call — running
        // them concurrently mostly buys a rate limit.
        const result = await ingestInboundResume(email, attachment)
        console.log(
          `[inbound-resume] ${attachment.filename} from ${email.fromEmail}: ${result.outcome}` +
            (result.detail ? ` — ${result.detail}` : ''),
        )
      }
    } catch (err) {
      console.error(`[inbound-resume] processing ${emailId} failed:`, err)
    }
  })

  return NextResponse.json({ ok: true, attachments: pdfs.length })
}
