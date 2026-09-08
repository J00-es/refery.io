import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveFee, type ResolvedFee } from '@/lib/fees'

/**
 * The two searches a general outreach link shows: the most urgent live
 * engineering search and the most urgent live GTM search, anonymised.
 *
 * Chosen by rule at render time, so the link in a scheduled DM stays true as
 * the desk changes. Nothing here can name the client: the title is stripped
 * of the company name, the facts are structural (stage, city, on-site or
 * remote, base band, fee), and the one-clause summary appears only once Lily
 * has approved it on /admin/campaigns.
 */

export type OutreachFunction = 'engineering' | 'gtm'

export interface FeaturedSearch {
  fn: OutreachFunction
  jobId: string
  /** The role's headline with the client's name removed. */
  title: string
  location: string | null
  /** "Seed-stage · SF Bay Area · on-site", whichever parts are known. */
  facts: string
  /** Lily's approved anonymised preview, or null when none is approved yet. */
  summary: string | null
  hiringNow: boolean
  pinned: boolean
  fee: ResolvedFee
  /** Internal only. Never rendered on a public page. */
  companyName: string | null
}

interface RoleRow {
  job_id: string
  title: string
  headline: string | null
  company_name: string | null
  company_stage: string | null
  department: string | null
  location: string | null
  remote_policy: string | null
  priority: string
  search_stage: string | null
  live_submission_count: number | null
  added_at: string
  salary_min: number | null
  salary_max: number | null
  salary_currency: string | null
  fee_percentage: number | string | null
  fee_flat: number | string | null
  scout_share: number | string | null
  scout_payout: number | string | null
  payout_note: string | null
}

const ROLE_COLUMNS =
  'job_id, title, headline, company_name, company_stage, department, location, remote_policy, priority, search_stage, live_submission_count, added_at, salary_min, salary_max, salary_currency, fee_percentage, fee_flat, scout_share, scout_payout, payout_note'

const ENGINEERING = ['engineer', 'developer', 'software', 'infrastructure', 'firmware', 'full-stack', 'fullstack', 'backend', 'frontend', 'devops', 'sre']
const GTM = ['sales', 'gtm', 'revenue', 'business development', 'commercial', 'partnerships', 'account manager', 'account executive', 'growth', 'marketing', 'customer success', 'go-to-market']

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 }

/** Engineering or GTM by title first, department second; anything else is neither. */
export function outreachFunction(role: { title: string; headline?: string | null; department?: string | null }): OutreachFunction | null {
  const title = `${role.headline ?? ''} ${role.title}`.toLowerCase()
  const dept = (role.department ?? '').toLowerCase()
  if (ENGINEERING.some(p => title.includes(p))) return 'engineering'
  if (GTM.some(p => title.includes(p))) return 'gtm'
  if (ENGINEERING.some(p => dept.includes(p))) return 'engineering'
  if (GTM.some(p => dept.includes(p))) return 'gtm'
  return null
}

export const FUNCTION_LABEL: Record<OutreachFunction, string> = { engineering: 'Engineering', gtm: 'Sales & GTM' }

/** The words a preview must not contain: the client's name and its first distinctive word. */
export function clientNameTokens(companyName: string | null | undefined): string[] {
  if (!companyName) return []
  const full = companyName.trim().toLowerCase()
  const first = full.split(/[\s'’]+/)[0]
  const tokens = [full]
  if (first.length >= 4 && first !== full && !['the', 'labs', 'inc', 'group'].includes(first)) tokens.push(first)
  return tokens
}

export function namesClient(text: string, companyName: string | null | undefined): string | null {
  const hay = text.toLowerCase()
  return clientNameTokens(companyName).find(t => hay.includes(t)) ?? null
}

/** "Product Manager, Livo Pool" becomes "Product Manager"; a headline without the name is untouched. */
export function anonymisedTitle(role: { title: string; headline?: string | null; company_name?: string | null }): string {
  const raw = (role.headline || role.title).replace(/\s*\(posted as[^)]*\)/i, '').trim()
  if (!namesClient(raw, role.company_name)) return raw
  const kept = raw
    .split(/\s*[,·:(]\s*/)
    .map(s => s.replace(/\)\s*$/, '').trim())
    .filter(s => s && !namesClient(s, role.company_name))
  return kept.join(', ') || 'A search'
}

function stageLabel(stage: string | null): string | null {
  if (!stage) return null
  const s = stage.toLowerCase()
  if (s.includes('pre')) return 'Pre-seed'
  if (s === 'seed') return 'Seed-stage'
  if (s.includes('series_a') || s.includes('series a')) return 'Series A'
  if (s.includes('series_b') || s.includes('series b')) return 'Series B'
  if (s.includes('series') || s === 'growth' || s === 'late') return 'Later-stage'
  if (s === 'established') return 'Established'
  return null
}

function remoteLabel(policy: string | null): string | null {
  if (!policy) return null
  const p = policy.toLowerCase()
  if (p === 'onsite' || p === 'on-site') return 'on-site'
  if (p === 'hybrid') return 'hybrid'
  if (p === 'remote') return 'remote'
  return null
}

function factLine(role: RoleRow): string {
  const loc = role.location?.trim() || null
  const remote = remoteLabel(role.remote_policy)
  return [stageLabel(role.company_stage), loc, loc && remote && loc.toLowerCase().includes(remote) ? null : remote].filter(Boolean).join(' · ')
}

function rank(a: RoleRow & { pinned: boolean }, b: RoleRow & { pinned: boolean }): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
  const pa = PRIORITY_RANK[a.priority] ?? 9
  const pb = PRIORITY_RANK[b.priority] ?? 9
  if (pa !== pb) return pa - pb
  const la = a.live_submission_count ?? 0
  const lb = b.live_submission_count ?? 0
  if (la !== lb) return la - lb
  return a.added_at.localeCompare(b.added_at)
}

/**
 * The rule: for each function, the pinned search if there is one, else the
 * highest priority, then the one with the fewest live submissions (it needs
 * people most), then the one open longest. Only searches still sourcing count.
 */
export async function featuredSearches(admin: SupabaseClient): Promise<{ engineering: FeaturedSearch | null; gtm: FeaturedSearch | null }> {
  const [{ data: roles }, { data: extras }] = await Promise.all([
    admin.from('partner_roles_v').select(ROLE_COLUMNS).eq('is_live', true).eq('job_status', 'open'),
    admin.from('partner_roles').select('job_id, preview_summary, preview_approved, outreach_pinned_at'),
  ])
  const extra = new Map((extras ?? []).map(e => [e.job_id as string, e]))
  const candidates = ((roles ?? []) as unknown as RoleRow[])
    .filter(r => r.search_stage === 'sourcing')
    .map(r => ({ ...r, pinned: Boolean(extra.get(r.job_id)?.outreach_pinned_at), fn: outreachFunction(r) }))
    .filter(r => r.fn !== null)
    .sort(rank)

  const pick = (fn: OutreachFunction): FeaturedSearch | null => {
    const r = candidates.find(c => c.fn === fn)
    if (!r) return null
    const title = anonymisedTitle(r)
    // Defensive: a title that still carries the client's name is never shown.
    if (namesClient(title, r.company_name)) return null
    const e = extra.get(r.job_id)
    const summary = e?.preview_approved && e.preview_summary && !namesClient(String(e.preview_summary), r.company_name) ? String(e.preview_summary) : null
    return {
      fn,
      jobId: r.job_id,
      title,
      location: r.location,
      facts: factLine(r),
      summary,
      hiringNow: r.priority === 'urgent',
      pinned: r.pinned,
      fee: resolveFee(r),
      companyName: r.company_name,
    }
  }
  return { engineering: pick('engineering'), gtm: pick('gtm') }
}
