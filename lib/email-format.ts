/**
 * The shape of an email address, checked before anything reaches Supabase.
 *
 * Supabase Auth rejects a malformed address with "Unable to validate email
 * address: invalid format", which names neither the field nor the value. On
 * 2026-09-10 a firm's CEO typed her surname into the Email box and the form
 * let her reach the last step four times, each ending in that message, with
 * the box two steps behind her and the address nowhere on screen.
 *
 * Every email input is checked here first, so the message quotes what was
 * typed and the form can send the person back to the box that needs fixing.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function isPlausibleEmail(raw: string | null | undefined): boolean {
  const s = (raw ?? '').trim()
  return s.length > 3 && s.length <= 254 && EMAIL_RE.test(s)
}

/**
 * A message the person can act on, or null when the address looks fine.
 * `what` names the box in their words: "your email", "their email".
 */
export function emailProblem(raw: string | null | undefined, what = 'your email'): string | null {
  const s = (raw ?? '').trim()
  if (!s) return `Please enter ${what}`
  if (isPlausibleEmail(s)) return null
  const shown = s.length > 60 ? `${s.slice(0, 57)}...` : s
  const box = what.charAt(0).toUpperCase() + what.slice(1)
  if (!s.includes('@')) {
    return `"${shown}" is not an email address. ${box} needs an @ and a domain, like name@company.com.`
  }
  return `"${shown}" does not look like a complete email address. Check ${what} for a typo, like a missing .com.`
}
