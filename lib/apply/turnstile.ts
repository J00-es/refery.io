/**
 * Cloudflare Turnstile, the free bot check on the candidate door. Without a
 * secret configured the check is skipped and the honeypot and rate limits
 * stand alone, so the form never breaks on a missing key.
 */
export async function verifyTurnstile(token: string | null, ip: string | null): Promise<{ ok: boolean; skipped: boolean }> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return { ok: true, skipped: true }
  if (!token) return { ok: false, skipped: false }
  try {
    const body = new URLSearchParams({ secret, response: token })
    if (ip) body.set('remoteip', ip)
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body })
    const json = (await res.json().catch(() => ({}))) as { success?: boolean }
    return { ok: json.success === true, skipped: false }
  } catch {
    // Cloudflare unreachable is not the person's fault: let the other gates decide.
    return { ok: true, skipped: true }
  }
}
