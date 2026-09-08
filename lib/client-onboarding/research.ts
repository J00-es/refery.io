/**
 * Gathering what the web says about a company, for the onboarding drafts.
 *
 * No search API key is needed: the company's own site, the job posts Lily
 * pasted (LinkedIn through its guest endpoint, anything else fetched as-is),
 * and a handful of DuckDuckGo result pages for the questions a brief has to
 * answer (funding, founders, press, headcount). Every page is trimmed to a
 * budget so a run costs cents, not dollars. Anything that fails to fetch is
 * simply absent; the model is told to leave out what it cannot source.
 */

const UA = 'Mozilla/5.0 (compatible; ReferyBot/1.0; +https://refery.io)'
const PAGE_CHARS = 9_000
const JOB_CHARS = 14_000
const FETCH_MS = 9_000

export interface SourcePage {
  url: string
  kind: 'site' | 'job' | 'search'
  title: string | null
  text: string
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
}

function titleOf(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return m ? htmlToText(m[1]).slice(0, 160) : null
}

export async function fetchPage(url: string, kind: SourcePage['kind'], cap = PAGE_CHARS): Promise<SourcePage | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8', 'Accept-Language': 'en,es;q=0.8' },
      signal: AbortSignal.timeout(FETCH_MS),
      redirect: 'follow',
    })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') ?? ''
    const body = await res.text()
    const text = ct.includes('json') ? body.slice(0, cap) : htmlToText(body).slice(0, cap)
    if (text.length < 200) return null
    return { url, kind, title: ct.includes('json') ? null : titleOf(body), text }
  } catch {
    return null
  }
}

/** linkedin.com/jobs/view/<id> is blocked for bots; the guest API is not. */
function linkedinJobId(url: string): string | null {
  const m = url.match(/linkedin\.com\/jobs\/view\/(?:[^/?#]*-)?(\d{6,})/i) ?? url.match(/currentJobId=(\d{6,})/i)
  return m ? m[1] : null
}

export async function fetchJob(input: string): Promise<SourcePage | null> {
  const url = input.trim()
  if (!/^https?:\/\//i.test(url)) return null
  const li = linkedinJobId(url)
  if (li) {
    const page = await fetchPage(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${li}`, 'job', JOB_CHARS)
    if (page) return { ...page, url }
  }
  return fetchPage(url, 'job', JOB_CHARS)
}

/** DuckDuckGo's HTML endpoint, no key. Returns result URLs in order. */
export async function searchUrls(query: string, limit = 5): Promise<string[]> {
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      signal: AbortSignal.timeout(FETCH_MS),
    })
    if (!res.ok) return []
    const html = await res.text()
    const urls: string[] = []
    for (const m of html.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"/g)) {
      let href = m[1]
      const uddg = href.match(/[?&]uddg=([^&]+)/)
      if (uddg) href = decodeURIComponent(uddg[1])
      if (/^https?:\/\//.test(href) && !/duckduckgo\.com/.test(href) && !urls.includes(href)) urls.push(href)
      if (urls.length >= limit) break
    }
    return urls
  } catch {
    return []
  }
}

const SKIP_HOSTS = /linkedin\.com\/(company|in)\/|glassdoor|indeed\.|facebook\.com|instagram\.com|x\.com|twitter\.com|youtube\.com|pitchbook\.com|crunchbase\.com\/organization/i

/**
 * The research bundle for one company. Site pages first, then the job posts,
 * then search results for the questions every brief asks. Capped at about
 * 20 pages so the model prompt stays under 100k tokens.
 */
export async function gatherSources(input: { website: string; companyName: string; roleInputs: string[] }): Promise<SourcePage[]> {
  const site = input.website.replace(/\/+$/, '')
  const origin = site.replace(/^(https?:\/\/[^/]+).*$/, '$1')
  const sitePaths = ['', '/about', '/about-us', '/en', '/en/about', '/careers', '/jobs', '/team', '/press', '/blog']
  const jobs = input.roleInputs.filter(r => /^https?:\/\//i.test(r))

  const [sitePages, jobPages] = await Promise.all([
    Promise.all(sitePaths.map(p => fetchPage(`${origin}${p}`, 'site'))),
    Promise.all(jobs.map(fetchJob)),
  ])

  const name = input.companyName
  const queries = [
    `"${name}" startup funding round investors`,
    `"${name}" founders CEO CTO`,
    `"${name}" ${origin.replace(/^https?:\/\//, '')} news`,
    `"${name}" employees headcount`,
  ]
  const found = await Promise.all(queries.map(q => searchUrls(q, 4)))
  const searchUrlsFlat = [...new Set(found.flat())].filter(u => !SKIP_HOSTS.test(u) && !u.startsWith(origin)).slice(0, 10)
  const searchPages = await Promise.all(searchUrlsFlat.map(u => fetchPage(u, 'search', 6_000)))

  const seen = new Set<string>()
  const pages: SourcePage[] = []
  for (const p of [...sitePages, ...jobPages, ...searchPages]) {
    if (!p || seen.has(p.url)) continue
    seen.add(p.url)
    pages.push(p)
  }
  return pages.slice(0, 22)
}
