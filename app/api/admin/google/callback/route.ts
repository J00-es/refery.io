import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAppUser } from '@/lib/current-user'

/**
 * Step two: Google sends the code back here. It is exchanged for a refresh
 * token, which is stored in desk_settings (service role only) along with the
 * granted scopes and the mailbox address. lib/google.ts prefers this token
 * over the one in the environment, so the desk can send the moment this
 * page says "connected".
 */
export async function GET(request: NextRequest) {
  const appUser = await getAppUser()
  if (!appUser?.isSuperAdmin) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const back = (msg: string, ok: boolean) => NextResponse.redirect(`${request.nextUrl.origin}/admin/settings?google=${ok ? 'connected' : 'error'}&msg=${encodeURIComponent(msg)}`)

  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const err = request.nextUrl.searchParams.get('error')
  if (err) return back(`Google said: ${err}`, false)
  if (!code || !state || state !== request.cookies.get('refery_google_state')?.value) return back('The sign-in did not come back the way it left. Try again.', false)

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return back('GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing in this environment.', false)

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${request.nextUrl.origin}/api/admin/google/callback`,
      grant_type: 'authorization_code',
    }),
  })
  const token = (await tokenRes.json().catch(() => ({}))) as { refresh_token?: string; access_token?: string; scope?: string; error?: string; error_description?: string }
  if (!tokenRes.ok || !token.refresh_token) {
    return back(`Google did not return a refresh token${token.error ? ` (${token.error}: ${token.error_description ?? ''})` : ''}. Remove Refery from your Google account's third-party access and try again.`, false)
  }

  // Whose mailbox this is, so the settings page can say so.
  let email = 'unknown'
  if (token.access_token) {
    const prof = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { Authorization: `Bearer ${token.access_token}` } })
    const p = (await prof.json().catch(() => ({}))) as { emailAddress?: string }
    email = p.emailAddress ?? email
  }

  const admin = createAdminClient()
  const now = new Date().toISOString()

  // A sourcing mailbox: the token lives on its own row, and the desk's own
  // token in desk_settings is left alone.
  if (request.cookies.get('refery_google_mailbox')?.value === '1') {
    const toMailboxes = (msg: string, ok: boolean) => NextResponse.redirect(`${request.nextUrl.origin}/sourcing/mailboxes?google=${ok ? 'connected' : 'error'}&msg=${encodeURIComponent(msg)}`)
    if (email === 'unknown') return toMailboxes('Google did not say which mailbox this is; nothing was saved.', false)
    const address = email.toLowerCase()
    const { data: existing } = await admin.from('sourcing_mailboxes').select('id').eq('address', address).maybeSingle()
    const credential = { kind: 'refresh_token', refresh_token: token.refresh_token }
    if (existing) await admin.from('sourcing_mailboxes').update({ credential, status: 'active', last_error: null }).eq('id', existing.id)
    else {
      const local = address.split('@')[0]
      const first = local.split(/[._-]/)[0]
      const signsAs = first.charAt(0).toUpperCase() + first.slice(1)
      await admin.from('sourcing_mailboxes').insert({
        address,
        display_name: signsAs,
        signs_as: signsAs,
        owner_email: appUser.email,
        credential,
        daily_cap: 10,
        cap_ceiling: 50,
        ramp_step: 5,
        ramp_started_at: now,
        reserved_other: 0,
        status: 'active',
      })
    }
    const res = toMailboxes(`Connected ${address}. Check the display name and who it signs as, then press Test.`, true)
    res.cookies.delete('refery_google_state')
    res.cookies.delete('refery_google_mailbox')
    return res
  }

  await admin.from('desk_settings').upsert(
    [
      { key: 'google_refresh_token', value: token.refresh_token, updated_at: now },
      { key: 'google_account', value: { email, scopes: (token.scope ?? '').split(' ').filter(Boolean), connected_at: now, by: appUser.email }, updated_at: now },
    ],
    { onConflict: 'key' },
  )
  const res = back(`Connected ${email}.`, true)
  res.cookies.delete('refery_google_state')
  return res
}
