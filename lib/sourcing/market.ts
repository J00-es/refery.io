/**
 * Market research for a seat, from the web, without a search key.
 *
 * The same keyless search and page fetch the client onboarding uses
 * (lib/client-onboarding/research.ts): Bing's HTML, then DuckDuckGo's, then
 * the pages themselves trimmed to a budget. Four questions per seat:
 *
 *   what the company builds        its own site
 *   who else builds it             "companies like X", competitor pages
 *   what the title pays here       salary pages for the title and city
 *   where these people work        "engineers who do Y" pages, team pages
 *
 * The result is one labelled text block for the profile builder, plus the
 * list of pages read. Ten pages at most; a run costs cents, not dollars.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchPage, searchUrls, type SourcePage } from '@/lib/client-onboarding/research'

const PAGE_CHARS = 5_000
const MAX_PAGES = 10
const SKIP = /linkedin\.com\/(in|posts|jobs)|glassdoor\.|indeed\.|facebook\.com|instagram\.com|x\.com|twitter\.com|youtube\.com|tiktok\.com|zoominfo|rocketreach|apollo\.io|crunchbase\.com\/person/i

export interface MarketResearch {
  text: string
  pages: { url: string; kind: string; title: string | null; chars: number }[]
  queries: string[]
}

function domainOf(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

export async function researchMarket(admin: SupabaseClient, jobId: string, input: { companyName: string; title: string; location: string | null; keywords?: string[] }): Promise<MarketResearch> {
  const { data: job } = await admin.from('jobs').select('company_id').eq('id', jobId).maybeSingle()
  const { data: company } = job?.company_id ? await admin.from('companies').select('website, industry, description').eq('id', job.company_id).maybeSingle() : { data: null }
  const site = company?.website ? `https://${domainOf(company.website)}` : null
  const city = (input.location ?? '').split(/[(,·]/)[0].trim() || 'San Francisco'
  const title = input.title.replace(/\(.*?\)/g, '').trim()
  const kw = (input.keywords ?? []).slice(0, 2).join(' ')

  const queries = [
    `companies like ${input.companyName}${company?.industry ? ` ${company.industry}` : ''} startups`,
    `${title} salary ${city} 2026`,
    `startups hiring ${title} ${city}${kw ? ` ${kw}` : ''}`,
    `${input.companyName} competitors`,
  ]

  const pages: SourcePage[] = []
  const seen = new Set<string>()
  const add = (p: SourcePage | null) => {
    if (!p || seen.has(p.url) || p.text.length < 300) return
    seen.add(p.url)
    pages.push({ ...p, text: p.text.slice(0, PAGE_CHARS) })
  }

  if (site) add(await fetchPage(site, 'site', PAGE_CHARS))

  const found = await Promise.all(queries.map(q => searchUrls(q, 4)))
  const urls = [...new Set(found.flat())].filter(u => !SKIP.test(u) && (!site || !u.startsWith(site))).slice(0, MAX_PAGES + 4)
  const fetched = await Promise.all(urls.map(u => fetchPage(u, 'search', PAGE_CHARS)))
  for (const p of fetched) {
    if (pages.length >= MAX_PAGES) break
    add(p)
  }

  const text = pages.length
    ? pages.map(p => `--- ${p.kind.toUpperCase()}: ${p.title ?? p.url}\n${p.url}\n${p.text}`).join('\n\n')
    : '(no pages could be read; the search engines answered nothing)'
  return { text, pages: pages.map(p => ({ url: p.url, kind: p.kind, title: p.title, chars: p.text.length })), queries }
}
