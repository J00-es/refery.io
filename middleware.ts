import { updateSession } from '@/lib/supabase/middleware'
import { NextResponse, type NextRequest } from 'next/server'

// /agreement/<company uuid> is the admin's page for a client's agreements.
// /agreement/<readable slug> is the public sign page under a name a client can
// read aloud (refery.xyz/agreement/edge-markets), served by app/sign/[slug].
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const AGREEMENT_SLUG = /^\/agreement\/([a-z0-9-]{2,60})\/?$/

export async function middleware(request: NextRequest) {
  const m = request.nextUrl.pathname.match(AGREEMENT_SLUG)
  if (m && !UUID.test(m[1])) {
    const url = request.nextUrl.clone()
    url.pathname = `/sign/${m[1]}`
    return NextResponse.rewrite(url)
  }
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images - .svg, .png, .jpg, .jpeg, .gif, .webp
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
