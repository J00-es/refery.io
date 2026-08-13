import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Svix-format webhook signature verification.
 *
 * Resend signs webhooks with Svix, whose SDK is the usual way to verify them.
 * Pulling in a dependency for one HMAC is a poor trade when the scheme is small
 * enough to read in one sitting: sign `id.timestamp.body` with the base64
 * secret, compare in constant time.
 *
 * Kept out of the route file so it can be tested directly — an inbound endpoint
 * that accepts unsigned payloads would let anyone on the internet create
 * candidates, so this is the one part that must not be taken on trust.
 */

/** How far a delivery's timestamp may drift before it is treated as a replay. */
export const TOLERANCE_SECONDS = 5 * 60

export interface SignatureHeaders {
  id: string | null
  timestamp: string | null
  signature: string | null
}

/**
 * Returns null when the delivery is authentic, or a short reason when it is
 * not. A reason is never surfaced to the caller — it goes to the logs, because
 * "invalid signature" with no detail is impossible to debug when the real cause
 * is a clock skew or a secret that was rotated on one side only.
 */
export function verifyResendSignature(
  headers: SignatureHeaders,
  rawBody: string,
  secret: string,
  now: number = Date.now(),
): string | null {
  const { id, timestamp, signature } = headers

  if (!id || !timestamp || !signature) return 'missing signature headers'

  const sentAt = Number(timestamp)
  if (!Number.isFinite(sentAt)) return 'malformed timestamp'
  if (Math.abs(now / 1000 - sentAt) > TOLERANCE_SECONDS) return 'timestamp outside tolerance'

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  if (key.length === 0) return 'empty signing secret'

  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest()

  // The header carries a space-separated list so a secret can be rotated
  // without dropping deliveries; any one entry matching is enough.
  const provided = signature
    .split(' ')
    .map(part => part.split(',', 2))
    .filter(parts => parts.length === 2 && parts[0].startsWith('v1'))
    .map(parts => Buffer.from(parts[1], 'base64'))

  if (!provided.length) return 'no v1 signature in header'

  const ok = provided.some(sig => sig.length === expected.length && timingSafeEqual(sig, expected))

  return ok ? null : 'signature mismatch'
}

/** The signature a sender with this secret would produce. Used by the tests. */
export function signResendPayload(
  id: string,
  timestamp: number,
  rawBody: string,
  secret: string,
): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const mac = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64')
  return `v1,${mac}`
}
