import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { getAppUser } from '@/lib/current-user'

/**
 * Step one of connecting Lily's mailbox to the desk: send her to Google's
 * consent screen asking for exactly the three scopes the desk needs. Super
 * admin only. The callback stores the refresh token in desk_settings, so
 * nothing has to be pasted into Vercel afterwards.
 */
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
]

export async function GET(request: NextRequest) {
  const appUser = await getAppUser()
  if (!appUser?.isSuperAdmin) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) return NextResponse.json({ error: 'GOOGLE_CLIENT_ID is not set in this environment' }, { status: 500 })

  const state = randomBytes(16).toString('hex')
  const redirect = `${request.nextUrl.origin}/api/admin/google/callback`
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirect)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', SCOPES.join(' '))
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('include_granted_scopes', 'true')
  url.searchParams.set('state', state)
  url.searchParams.set('login_hint', 'lily@refery.io')

  const res = NextResponse.redirect(url)
  res.cookies.set('refery_google_state', state, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600, path: '/' })
  return res
}
