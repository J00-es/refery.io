/**
 * Gathering what the web says about a company, for the onboarding drafts.
 *
 * No search API key is needed: the company's own site (the homepage, then the
 * about, team, careers and press pages it links to), Wikipedia when it has an
 * article, the job posts Lily pasted (LinkedIn through its guest endpoint,
 * anything else fetched as-is), and a handful of web search results for the
 * questions a brief has to answer. Search goes to Bing's HTML first, which
 * answers from a server, and to DuckDuckGo's two HTML endpoints after it.
 * Every page is trimmed to a budget so a run costs cents. Anything that fails
 * to fetch is recorded as a miss and simply absent from the facts.
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 ReferyBot/1.0'
const PAGE_CHARS = 9_000
const JOB_CHARS = 14_000
const SEARCH_CHARS = 6_000
const FETCH_MS = 9_000

export interface SourcePage {
  url: string
  kind: 'site' | 'job' | 'search' | 'wiki'
  title: string | null
  text: string
}

export interface SourceMiss {
  url: string
  kind: string
  reason: string
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|dd|dt)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|&#x27;/g, "'")
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

async function fetchHtml(url: string): Promise<{ html: string; contentType: string; finalUrl: string } | { error: string }> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8', 'Accept-Language': 'en,es;q=0.8' },
      signal: AbortSignal.timeout(FETCH_MS),
      redirect: 'follow',
    })
    if (!res.ok) return { error: `http ${res.status}` }
    return { html: await res.text(), contentType: res.headers.get('content-type') ?? '', finalUrl: res.url || url }
  } catch (err) {
    return { error: err instanceof Error ? err.name === 'TimeoutError' ? 'timeout' : err.message.slice(0, 80) : 'failed' }
  }
}

export async function fetchPage(url: string, kind: SourcePage['kind'], cap = PAGE_CHARS): Promise<SourcePage | null> {
  const r = await fetchHtml(url)
  if ('error' in r) return null
  const text = r.contentType.includes('json') ? r.html.slice(0, cap) : htmlToText(r.html).slice(0, cap)
  if (text.length < 200) return null
  return { url, kind, title: r.contentType.includes('json') ? null : titleOf(r.html), text }
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

function decodeHref(raw: string): string {
  const h = raw.replace(/&amp;/g, '&')
  const uddg = h.match(/[?&]uddg=([^&]+)/)
  if (uddg) return decodeURIComponent(uddg[1])
  // Bing wraps every result as /ck/a?...&u=a1<base64url of the real URL>.
  const bing = h.match(/[?&]u=a1([A-Za-z0-9_-]+)/)
  if (bing) {
    try {
      return Buffer.from(bing[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    } catch {
      return h
    }
  }
  return h
}

/** Web search without a key: Bing HTML, then the two DuckDuckGo HTML endpoints. */
export async function searchUrls(query: string, limit = 5): Promise<string[]> {
  const q = encodeURIComponent(query)
  const attempts: { url: string; pattern: RegExp }[] = [
    { url: `https://www.bing.com/search?q=${q}&setlang=en`, pattern: /<h2[^>]*>\s*<a[^>]+href="([^"]+)"/g },
    { url: `https://html.duckduckgo.com/html/?q=${q}`, pattern: /<a[^>]+class="result__a"[^>]+href="([^"]+)"/g },
    { url: `https://lite.duckduckgo.com/lite/?q=${q}`, pattern: /<a[^>]+rel="nofollow"[^>]+href="([^"]+)"/g },
  ]
  for (const a of attempts) {
    const r = await fetchHtml(a.url)
    if ('error' in r) continue
    const urls: string[] = []
    for (const m of r.html.matchAll(a.pattern)) {
      const href = decodeHref(m[1])
      if (/^https?:\/\//.test(href) && !/bing\.com|duckduckgo\.com|microsoft\.com/.test(href) && !urls.includes(href)) urls.push(href)
      if (urls.length >= limit) break
    }
    if (urls.length) return urls
  }
  return []
}

const SKIP_HOSTS = /linkedin\.com\/(company|in|posts)\/|glassdoor|indeed\.|facebook\.com|instagram\.com|x\.com|twitter\.com|youtube\.com|pitchbook\.com|crunchbase\.com|zoominfo|rocketreach|apollo\.io|tiktok\.com/i

/** The about, team, careers and press pages the homepage itself links to. */
function siteLinks(html: string, origin: string): string[] {
  const out: string[] = []
  for (const m of html.matchAll(/href="([^"#?]+)"/g)) {
    let href = m[1]
    if (href.startsWith('/')) href = origin + href
    if (!href.startsWith(origin)) continue
    if (!/about|company|team|founders|careers|jobs|press|news|story|mission|who-we-are|nosotros|equipo|empresa/i.test(href)) continue
    href = href.replace(/\/+$/, '')
    if (!out.includes(href)) out.push(href)
    if (out.length >= 8) break
  }
  return out
}

export interface Gathered {
  pages: SourcePage[]
  misses: SourceMiss[]
}

/**
 * The research bundle for one company, capped at about 24 pages so the
 * prompt stays well under 100k tokens.
 */
export async function gatherSources(input: { website: string; companyName: string; roleInputs: string[] }): Promise<Gathered> {
  const site = input.website.replace(/\/+$/, '')
  const origin = site.replace(/^(https?:\/\/[^/]+).*$/, '$1')
  const misses: SourceMiss[] = []
  const pages: SourcePage[] = []
  const seen = new Set<string>()
  const add = (p: SourcePage | null, url: string, kind: string) => {
    if (!p) {
      misses.push({ url, kind, reason: 'empty or unreachable' })
      return
    }
    if (seen.has(p.url)) return
    seen.add(p.url)
    pages.push(p)
  }

  // Homepage first, and the pages it links to.
  let home = await fetchHtml(origin)
  // A bare origin often serves a language chooser; the English home carries the copy.
  if (!('error' in home) && htmlToText(home.html).length < 600) {
    const en = await fetchHtml(`${origin}/en`)
    if (!('error' in en) && htmlToText(en.html).length > htmlToText(home.html).length) home = en
  }
  if ('error' in home) misses.push({ url: origin, kind: 'site', reason: home.error })
  else {
    const homeText = htmlToText(home.html).slice(0, PAGE_CHARS)
    if (homeText.length >= 200) {
      seen.add(home.finalUrl)
      pages.push({ url: home.finalUrl, kind: 'site', title: titleOf(home.html), text: homeText })
    }
    const links = siteLinks(home.html, origin)
    const linked = await Promise.all(links.map(u => fetchPage(u, 'site')))
    linked.forEach((p, i) => add(p, links[i], 'site'))
  }

  // Wikipedia, when it has an article under the company's name.
  const wiki = await fetchPage(`https://en.wikipedia.org/wiki/${encodeURIComponent(input.companyName.replace(/\s+/g, '_'))}`, 'wiki', SEARCH_CHARS)
  if (wiki && !/may refer to:|Wikipedia does not have an article/i.test(wiki.text)) add(wiki, wiki.url, 'wiki')

  // The job posts.
  const jobs = input.roleInputs.filter(r => /^https?:\/\//i.test(r))
  const jobPages = await Promise.all(jobs.map(fetchJob))
  jobPages.forEach((p, i) => add(p, jobs[i], 'job'))

  // Web search for what a brief has to answer.
  const name = input.companyName
  const host = origin.replace(/^https?:\/\//, '')
  const queries = [`"${name}" ${host} funding investors`, `"${name}" founders CEO`, `"${name}" ${host} news 2026`, `"${name}" employees company`]
  const found = await Promise.all(queries.map(q => searchUrls(q, 4)))
  const searchTargets = [...new Set(found.flat())].filter(u => !SKIP_HOSTS.test(u) && !u.startsWith(origin) && !/wikipedia\.org/.test(u)).slice(0, 10)
  if (!searchTargets.length) misses.push({ url: 'search', kind: 'search', reason: 'no results from any engine' })
  const searchPages = await Promise.all(searchTargets.map(u => fetchPage(u, 'search', SEARCH_CHARS)))
  searchPages.forEach((p, i) => add(p, searchTargets[i], 'search'))

  return { pages: pages.slice(0, 24), misses }
}
