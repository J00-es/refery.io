/**
 * The hiring-manager brief: the note we send a founder before sourcing starts.
 *
 * It is the same document a scout reads (`lib/brief.ts`, rendered by
 * `components/partners/brief-document.tsx`) pointed at a different audience —
 * published at a short public URL, opened without an account, and answerable in
 * place. The point is to close the loop: the hiring manager corrects the brief
 * where it is wrong, and we hear about it in Slack while it still matters.
 *
 * ── Access ─────────────────────────────────────────────────────────────────
 * There is no login, so the link *is* the credential. `slug` is the company
 * name plus a random suffix — short enough to paste into an email, wide enough
 * that the space cannot be walked. Rotating the suffix revokes every link
 * already sent. The tables are RLS-on with no policies, so the anon key reaches
 * nothing; every read and write goes through a service-role route.
 *
 * Because the URL is the credential, none of these pages may be indexed, and
 * none of them may leak whether a slug exists: a miss and a draft both 404.
 */

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/server'
import { notifySlack } from '@/lib/slack'
import type { BriefContent } from '@/lib/brief'

// ── slugs ───────────────────────────────────────────────────────────────────

/**
 * No 0/O/1/l/i. The link is clicked rather than typed, but these also get read
 * aloud on calls and retyped from a screenshot, and that is where they break.
 */
const TOKEN_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'
const TOKEN_LENGTH = 7

/** ~2.7e10 slugs per company name — not walkable, one character longer than six. */
export function briefToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_LENGTH))
  return Array.from(bytes, b => TOKEN_ALPHABET[b % TOKEN_ALPHABET.length]).join('')
}

export function slugifyCompany(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    // Combining marks left behind by NFKD, so "Åltera" slugs as "altera".
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '')
  return base || 'brief'
}

/** e.g. "Alcor Labs" → "alcor-labs-9x4m2qk". */
export function newBriefSlug(companyName: string): string {
  return `${slugifyCompany(companyName)}-${briefToken()}`
}

export function briefUrl(slug: string): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://refery.xyz'
  return `${base.replace(/\/+$/, '')}/b/${slug}`
}

// ── the viewer ──────────────────────────────────────────────────────────────

export interface ViewerContext {
  ip: string | null
  country: string | null
  region: string | null
  city: string | null
  latitude: string | null
  longitude: string | null
  timezone: string | null
  userAgent: string | null
}

function header(h: Headers, name: string): string | null {
  const v = h.get(name)
  return v && v.trim() ? v.trim() : null
}

/**
 * Where the request came from, read off the edge rather than asked of the page.
 *
 * Vercel resolves geo-IP at the edge and hands it over as headers, so this costs
 * nothing and cannot be spoofed by the client the way a JS-reported location
 * could. City names arrive percent-encoded ("San%20Francisco").
 */
export function viewerContext(headers: Headers): ViewerContext {
  const decode = (v: string | null) => {
    if (!v) return null
    try {
      return decodeURIComponent(v)
    } catch {
      return v
    }
  }

  // x-forwarded-for is a chain; the client is the first entry.
  const forwarded = header(headers, 'x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0].trim() : header(headers, 'x-real-ip')

  return {
    ip: ip || null,
    country: header(headers, 'x-vercel-ip-country'),
    region: decode(header(headers, 'x-vercel-ip-country-region')),
    city: decode(header(headers, 'x-vercel-ip-city')),
    latitude: header(headers, 'x-vercel-ip-latitude'),
    longitude: header(headers, 'x-vercel-ip-longitude'),
    timezone: header(headers, 'x-vercel-ip-timezone'),
    userAgent: header(headers, 'user-agent'),
  }
}

/** "US" → "🇺🇸". Regional indicators sit 0x1F1E6 above 'A'. */
function flag(country: string | null): string {
  if (!country || !/^[A-Za-z]{2}$/.test(country)) return ''
  const cps = country
    .toUpperCase()
    .split('')
    .map(c => 0x1f1e6 + c.charCodeAt(0) - 65)
  return String.fromCodePoint(...cps)
}

/** "San Francisco, CA 🇺🇸" — as much as we have, in the order a human reads it. */
export function describePlace(v: {
  city?: string | null
  region?: string | null
  country?: string | null
}): string {
  const parts = [v.city, v.region].filter(Boolean)
  const where = parts.join(', ')
  const f = flag(v.country ?? null)
  if (where && f) return `${where} ${f}`
  if (where) return where
  return v.country ? `${v.country} ${f}`.trim() : 'Unknown location'
}

/**
 * "iPhone · Safari". Deliberately coarse — the useful question is whether the
 * founder opened it on a phone between meetings or sat down with it at a desk.
 */
export function describeDevice(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device'
  const ua = userAgent

  const os = /iPhone/i.test(ua)
    ? 'iPhone'
    : /iPad/i.test(ua)
      ? 'iPad'
      : /Android/i.test(ua)
        ? 'Android'
        : /Mac OS X|Macintosh/i.test(ua)
          ? 'Mac'
          : /Windows/i.test(ua)
            ? 'Windows'
            : /Linux/i.test(ua)
              ? 'Linux'
              : 'Unknown'

  // Order matters: Edge and Chrome both claim Safari, Edge also claims Chrome.
  const browser = /Edg\//i.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/i.test(ua)
      ? 'Opera'
      : /Firefox\//i.test(ua)
        ? 'Firefox'
        : /Chrome\//i.test(ua)
          ? 'Chrome'
          : /Safari\//i.test(ua)
            ? 'Safari'
            : 'Unknown browser'

  return `${os} · ${browser}`
}

/** "4m 12s" — Slack fields are narrow and a raw millisecond count reads as noise. */
export function describeDuration(ms: number | null | undefined): string {
  if (!ms || ms < 1000) return 'under a second'
  const total = Math.round(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  if (!m) return `${s}s`
  return s ? `${m}m ${s}s` : `${m}m`
}

// ── notifications ───────────────────────────────────────────────────────────

export interface BriefRef {
  id: string
  slug: string
  title: string
  companyName: string
  recipientName: string | null
}

/**
 * Someone opened the brief.
 *
 * Fired once per sitting, not per page load: a founder who reloads or reopens a
 * tab twenty minutes later should not read as twenty minutes of interest, and a
 * channel that cries wolf gets muted.
 */
export async function notifyBriefOpened(brief: BriefRef, v: ViewerContext, referrer: string | null) {
  await notifySlack({
    stream: 'clients',
    emoji: ':eyes:',
    title: `${brief.companyName} opened the hiring manager brief`,
    context: brief.recipientName
      ? `Sent to ${brief.recipientName}. A summary of how far they read follows when they close it.`
      : 'A summary of how far they read follows when they close it.',
    fields: [
      { label: 'Where', value: describePlace(v) },
      { label: 'Device', value: describeDevice(v.userAgent) },
      { label: 'Local time', value: v.timezone ?? 'Unknown' },
      { label: 'Came from', value: referrer || 'Direct or email' },
    ],
    links: [{ label: 'Open the brief', url: briefUrl(brief.slug) }],
  })
}

/**
 * Where the reading stopped.
 *
 * This is the signal worth acting on: a founder who read to "The bar" and quit
 * has a different objection from one who reached "A few things to confirm" and
 * left without answering.
 */
export async function notifyBriefRead(
  brief: BriefRef,
  v: ViewerContext,
  summary: { furthestLabel: string | null; scrollPct: number | null; dwellMs: number | null },
) {
  const stopped = summary.furthestLabel ?? 'the top of the page'
  await notifySlack({
    stream: 'clients',
    emoji: ':book:',
    title: `${brief.companyName} finished reading. Stopped at ${stopped}`,
    context:
      summary.scrollPct != null && summary.scrollPct >= 90
        ? 'They reached the end. If nothing came back on the confirm list, that is the nudge.'
        : 'They stopped part way. Worth a note asking what was unclear.',
    fields: [
      { label: 'Stopped at', value: stopped },
      { label: 'Read', value: summary.scrollPct != null ? `${summary.scrollPct}% of the page` : 'Unknown' },
      { label: 'Time on page', value: describeDuration(summary.dwellMs) },
      { label: 'Where', value: describePlace(v) },
    ],
    links: [{ label: 'Open the brief', url: briefUrl(brief.slug) }],
  })
}

/** A correction landed. This one is always worth interrupting for. */
export async function notifyBriefComment(
  brief: BriefRef,
  v: ViewerContext,
  comment: { author: string | null; sectionLabel: string | null; prompt: string | null; body: string },
  action: 'added' | 'edited' | 'deleted' = 'added',
) {
  const who = comment.author?.trim() || 'Someone'
  const verb = action === 'added' ? 'commented on' : `${action} a comment on`
  const where = comment.sectionLabel ?? 'the general thread'

  const fields = [
    { label: 'Section', value: where },
    { label: 'From', value: `${who} · ${describePlace(v)}` },
  ]
  if (comment.prompt) fields.unshift({ label: 'Answering', value: comment.prompt })

  await notifySlack({
    stream: 'clients',
    emoji: action === 'deleted' ? ':wastebasket:' : ':speech_balloon:',
    title: `${who} ${verb} the ${brief.companyName} brief`,
    context:
      action === 'deleted'
        ? 'Deleted by the person who wrote it. Kept here as the record.'
        : 'Reply in the thread you already have with them. They are reading right now.',
    fields,
    body: comment.body,
    links: [{ label: 'Open the brief', url: `${briefUrl(brief.slug)}#comments` }],
  })
}

// ── lookup ──────────────────────────────────────────────────────────────────

export interface PublicBrief {
  id: string
  slug: string
  title: string
  status: string
  content: BriefContent
  ribbonNote: string | null
  recipientName: string | null
  companyName: string
  updatedAt: string
}

/**
 * The brief behind a slug, or null.
 *
 * Null covers every reason equally — no such slug, still a draft, revoked —
 * because a caller that can tell those apart can probe for which companies we
 * are working with.
 *
 * Memoised per request: `generateMetadata` and the page body both need the
 * brief, and that is one lookup, not two.
 */
export const findPublishedBrief = cache(async function findPublishedBrief(
  slug: string,
): Promise<PublicBrief | null> {
  if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 80) return null

  const db = createAdminClient()
  const { data } = await db
    .from('hm_briefs')
    .select('id, slug, title, status, content, ribbon_note, recipient_name, updated_at, companies(name)')
    .eq('slug', slug)
    .maybeSingle()

  if (!data || data.status !== 'published') return null

  // The join arrives as an object or a one-element array depending on how
  // PostgREST resolves the relationship; normalise rather than trust either.
  const rel = data.companies as unknown
  const company = Array.isArray(rel) ? rel[0] : rel

  return {
    id: data.id,
    slug: data.slug,
    title: data.title,
    status: data.status,
    content: data.content as BriefContent,
    ribbonNote: data.ribbon_note,
    recipientName: data.recipient_name,
    companyName: (company as { name?: string } | null)?.name ?? data.title,
    updatedAt: data.updated_at,
  }
})

export function briefRef(brief: PublicBrief): BriefRef {
  return {
    id: brief.id,
    slug: brief.slug,
    title: brief.title,
    companyName: brief.companyName,
    recipientName: brief.recipientName,
  }
}
