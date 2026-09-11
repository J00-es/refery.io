import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { getAppUser } from '@/lib/current-user'
import { CARD } from '@/lib/candidate-ui'
import { briefUrl } from '@/lib/hm-brief'
import { CopyLink } from '@/components/admin/copy-link'

/**
 * Every link a client has been sent, on one page.
 *
 * Two things go to a founder before sourcing starts: the hiring-manager brief
 * (/b/<company>) and the services agreement (/agreement/<company>). Until now
 * each lived only on its own company page, so "which agreements are still
 * unsigned" meant opening companies one at a time. This is the list: one row
 * per company, the two links side by side, and what has happened on each.
 *
 * Nothing is created here. Creating a brief or issuing an agreement stays on
 * the company page, where the recipient and fee get typed in with the company
 * in front of you; every row links there.
 */

export const dynamic = 'force-dynamic'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://refery.xyz').replace(/\/$/, '')

interface BriefRow {
  id: string
  company_id: string
  slug: string
  status: string
  recipient_name: string | null
  published_at: string | null
  created_at: string
}
interface LinkRow {
  id: string
  company_id: string
  company_name: string
  token: string
  short_slug: string | null
  status: string
  agreement_version: string
  fee_percentage: number
  fee_options: number[] | null
  recipient_name: string | null
  recipient_email: string | null
  created_at: string
  viewed_at: string | null
  signed_at: string | null
  expires_at: string | null
}

function ago(iso: string | null): string {
  if (!iso) return ''
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d}d ago`
}
function short(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

const TEST = /sandbox|globalcorp|zzz/i

export default async function ClientLinksPage() {
  const appUser = await getAppUser()
  if (!appUser) redirect('/auth/login')
  if (!appUser.isSuperAdmin) notFound()

  const admin = createAdminClient()
  const [{ data: briefs }, { data: links }] = await Promise.all([
    admin
      .from('hm_briefs')
      .select('id, company_id, slug, status, recipient_name, published_at, created_at')
      .order('created_at', { ascending: false }),
    admin
      .from('client_agreement_links')
      .select(
        'id, company_id, company_name, token, short_slug, status, agreement_version, fee_percentage, fee_options, recipient_name, recipient_email, created_at, viewed_at, signed_at, expires_at',
      )
      .order('created_at', { ascending: false }),
  ])

  const briefRows = (briefs ?? []) as BriefRow[]
  const linkRows = (links ?? []) as LinkRow[]

  const companyIds = Array.from(new Set([...briefRows.map(b => b.company_id), ...linkRows.map(l => l.company_id)]))
  const { data: companies } = companyIds.length
    ? await admin.from('companies').select('id, name').in('id', companyIds)
    : { data: [] as { id: string; name: string }[] }
  const nameOf = new Map((companies ?? []).map(c => [c.id, c.name]))

  // One row per company. The newest brief and the newest link that is not
  // revoked lead the row; older links sit under it as history.
  const byCompany = new Map<string, { brief: BriefRow | null; links: LinkRow[]; latest: string }>()
  for (const b of briefRows) {
    const row = byCompany.get(b.company_id) ?? { brief: null, links: [], latest: b.created_at }
    if (!row.brief) row.brief = b
    if (b.created_at > row.latest) row.latest = b.created_at
    byCompany.set(b.company_id, row)
  }
  for (const l of linkRows) {
    const row = byCompany.get(l.company_id) ?? { brief: null, links: [], latest: l.created_at }
    row.links.push(l)
    if (l.created_at > row.latest) row.latest = l.created_at
    byCompany.set(l.company_id, row)
  }

  const rows = Array.from(byCompany.entries())
    .map(([companyId, r]) => ({
      companyId,
      name: nameOf.get(companyId) ?? r.links[0]?.company_name ?? 'Unknown company',
      ...r,
    }))
    .sort((a, b) => (a.latest < b.latest ? 1 : -1))

  const live = rows.filter(r => !TEST.test(r.name))
  const test = rows.filter(r => TEST.test(r.name))

  const linkUrl = (l: LinkRow) =>
    l.short_slug ? `${APP_URL}/agreement/${l.short_slug}` : `${APP_URL}/sign/client-agreement/${l.token}`

  const linkState = (l: LinkRow) => {
    if (l.status === 'signed') return { label: `Signed ${short(l.signed_at)}`, tone: 'text-[#2F6B3A]' }
    if (l.status === 'revoked') return { label: 'Revoked', tone: 'text-[#8A8A83]' }
    const expired = l.status === 'expired' || (l.expires_at && new Date(l.expires_at) < new Date())
    if (expired) return { label: `Expired ${short(l.expires_at)}`, tone: 'text-[#A33A2B]' }
    if (l.status === 'viewed') return { label: `Viewed ${ago(l.viewed_at)}, not signed`, tone: 'text-[#8A5A16]' }
    return { label: `Sent ${ago(l.created_at)}, not opened`, tone: 'text-[#6E6E68]' }
  }

  const fee = (l: LinkRow) =>
    l.fee_options && l.fee_options.length >= 2 ? `${l.fee_options.join(' or ')}%` : `${Number(l.fee_percentage)}%`

  function Row({ r }: { r: (typeof rows)[number] }) {
    const current = r.links.find(l => l.status !== 'revoked') ?? r.links[0] ?? null
    const older = r.links.filter(l => l !== current)
    return (
      <div className={`${CARD} p-5`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Link href={`/companies/${r.companyId}`} className="text-[17px] font-semibold text-[#161613] hover:underline">
            {r.name}
          </Link>
          <Link href={`/companies/${r.companyId}`} className="text-[13px] text-[#6E6E68] hover:underline">
            Company page
          </Link>
        </div>

        <div className="mt-4 grid gap-5 md:grid-cols-2">
          <section>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8A8A83]">Hiring manager brief</p>
            {r.brief ? (
              <>
                <CopyLink url={briefUrl(r.brief.slug)} />
                <p className="mt-1 text-[13px] text-[#6E6E68]">
                  {r.brief.status === 'published'
                    ? `Live since ${short(r.brief.published_at)}`
                    : r.brief.status === 'draft'
                      ? 'Draft, not reachable yet'
                      : 'Revoked'}
                  {r.brief.recipient_name ? ` · for ${r.brief.recipient_name}` : ''}
                </p>
              </>
            ) : (
              <p className="mt-1 text-[13px] text-[#6E6E68]">
                None yet.{' '}
                <Link href={`/companies/${r.companyId}`} className="underline">
                  Start one on the company page
                </Link>
                .
              </p>
            )}
          </section>

          <section>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8A8A83]">Services agreement</p>
            {current ? (
              <>
                <CopyLink url={linkUrl(current)} />
                <p className={`mt-1 text-[13px] ${linkState(current).tone}`}>
                  {linkState(current).label} · v{current.agreement_version} · {fee(current)}
                  {current.recipient_name ? ` · to ${current.recipient_name}` : ' · open link'}
                  {!current.recipient_email && current.status !== 'signed' ? ' · no email on file' : ''}
                </p>
                {older.length > 0 && (
                  <p className="mt-1 text-[12px] text-[#8A8A83]">
                    {older.length} earlier {older.length === 1 ? 'link' : 'links'}:{' '}
                    {older.map(l => `${l.status} ${short(l.created_at)}`).join(', ')}
                  </p>
                )}
              </>
            ) : (
              <p className="mt-1 text-[13px] text-[#6E6E68]">
                None yet.{' '}
                <Link href={`/companies/${r.companyId}`} className="underline">
                  Issue one on the company page
                </Link>
                .
              </p>
            )}
          </section>
        </div>
      </div>
    )
  }

  const unsigned = live.filter(r => r.links.some(l => l.status === 'sent' || l.status === 'viewed')).length

  return (
    <div className="space-y-6 pb-10">
      <header>
        <h1 className="text-[30px] font-semibold leading-[1.15] tracking-[-0.025em] text-[#161613] sm:text-[36px]">
          Client links
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] text-[#6E6E68] sm:text-[15px]">
          Every brief and agreement a client has been sent, newest first. Links are the company
          name: refery.xyz/b/edge-markets for the brief, refery.xyz/agreement/edge-markets for
          the agreement. To start a brief or issue an agreement, open the company page.
        </p>
        {unsigned > 0 && (
          <p className="mt-2 text-[14px] text-[#8A5A16]">
            {unsigned} {unsigned === 1 ? 'agreement is' : 'agreements are'} out and unsigned.
          </p>
        )}
      </header>

      {live.length === 0 ? (
        <p className="text-[14px] text-[#6E6E68]">Nothing sent yet.</p>
      ) : (
        <div className="space-y-3">
          {live.map(r => (
            <Row key={r.companyId} r={r} />
          ))}
        </div>
      )}

      {test.length > 0 && (
        <details className="pt-2">
          <summary className="cursor-pointer text-[13px] text-[#8A8A83]">
            {test.length} test {test.length === 1 ? 'company' : 'companies'}
          </summary>
          <div className="mt-3 space-y-3">
            {test.map(r => (
              <Row key={r.companyId} r={r} />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
