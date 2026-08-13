import type { NextRequest } from 'next/server'

/**
 * Who and where a request came from.
 *
 * Location comes from Vercel's edge geo headers, which are attached to every
 * request at no cost and with no third party lookup. On localhost they are
 * simply absent, and everything here degrades to null rather than guessing.
 */

export interface RequestContext {
  ip: string | null
  city: string | null
  region: string | null
  country: string | null
  /** "Seoul, KR" for display, or null when the edge did not resolve it. */
  location: string | null
  device: string | null
  userAgent: string | null
}

function header(req: NextRequest, name: string): string | null {
  const v = req.headers.get(name)
  return v && v.trim() ? decodeURIComponent(v.trim()) : null
}

export function getRequestContext(req: NextRequest): RequestContext {
  const forwarded = req.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0].trim() : req.headers.get('x-real-ip')

  const city = header(req, 'x-vercel-ip-city')
  const region = header(req, 'x-vercel-ip-country-region')
  const country = header(req, 'x-vercel-ip-country')
  const userAgent = req.headers.get('user-agent')

  const location = [city, country].filter(Boolean).join(', ') || null

  return { ip, city, region, country, location, device: describeDevice(userAgent), userAgent }
}

/** Coarse device string, for "opened on an iPhone". Not fingerprinting. */
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

export function isLikelyBot(userAgent: string | null): boolean {
  if (!userAgent) return true
  return /bot|crawler|spider|slurp|preview|fetch|curl|wget|python-requests|headless|monitor|scan|proofpoint|barracuda|mimecast|outlook-ios|googleimageproxy/i.test(
    userAgent,
  )
}
