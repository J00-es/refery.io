import Link from 'next/link'
import { FileText, Lock, Sparkles } from 'lucide-react'
import { CARD, CHIP_BAD, CHIP_VALUE, CHIP_WARN, FIGURE, FOCUS, FOREST, H3, LABEL, LEDE, META, RULE, WELL, detailLine } from '@/lib/desk-ui'
import { REMOTE_LABELS, seniorityLabel, shortAge } from '@/lib/job-ui'
import { feeExplanation, payoutAmount, resolveFee } from '@/lib/fees'
import { stageLabel } from '@/lib/company-ui'
import { submissionStatus, type PartnerCompanyView, type PartnerRoleRow, type SearchAssignmentRow } from '@/lib/partners'
import { ProposalActions } from './proposal-card'
import { StageStrip } from './stage-strip'

/**
 * The pieces of the Searches home, in the order a partner reads them.
 *
 * Needs you, then what Refery has proposed, then what they are working grouped
 * by client so a partner on three Augustus seats reads the client once, then
 * what is open to them on request. A right rail carries the week and their
 * numbers. Every count is about the viewer's own work; nothing here counts
 * other partners.
 */

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')
}

// ── needs you ───────────────────────────────────────────────────────────────

export interface NeedsYouItem {
  text: string
  href: string
  action: string
  tone: 'amber' | 'green'
}

export function NeedsYou({ items }: { items: NeedsYouItem[] }) {
  if (!items.length) return null
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.slice(0, 3).map((item, i) => (
        <Link
          key={i}
          href={item.href}
          className={`flex items-center gap-3 rounded-[14px] px-4 py-3.5 text-[13.5px] font-medium transition-colors ${FOCUS} ${
            item.tone === 'amber'
              ? 'bg-[#F5EEDD] text-[#8A6A1F] hover:bg-[#F0E6CC]'
              : 'bg-[#E7EDE9] text-[#1F3A2F] hover:bg-[#DDE7E1]'
          }`}
        >
          <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${item.tone === 'amber' ? 'bg-[#C79A2E]' : 'bg-[#3F8F73]'}`} />
          <span className="min-w-0 flex-1">{item.text}</span>
          <span className="shrink-0 text-[12.5px] font-semibold">{item.action} →</span>
        </Link>
      ))}
    </div>
  )
}

// ── proposed ────────────────────────────────────────────────────────────────

export function ProposedCard({
  role,
  company,
  assignment,
  myMatches,
}: {
  role: PartnerRoleRow
  company: PartnerCompanyView | undefined
  assignment: SearchAssignmentRow
  myMatches: number
}) {
  const fee = resolveFee(role)
  const payout = payoutAmount(fee)
  const name = company?.name ?? role.company_name ?? 'Client'
  return (
    <div className={`border-[#E4D9B8] bg-[#FFFDF7] p-5 ${CARD}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#161613] text-[13px] font-bold text-white sm:inline-flex">
          {initials(name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/searches/${role.company_id}/roles/${role.job_id}`} className={`${H3} underline-offset-4 hover:underline ${FOCUS}`}>
              {role.headline || role.title}
            </Link>
            {role.priority === 'urgent' && <span className={CHIP_BAD}>Urgent</span>}
            {role.priority === 'high' && <span className={CHIP_WARN}>Priority</span>}
          </div>
          <p className="mt-1 text-[14px] text-[#2A2A26]">{name}</p>
          <p className={`mt-0.5 ${META}`}>
            {detailLine(
              role.location,
              role.remote_policy ? REMOTE_LABELS[role.remote_policy] : null,
              role.seniority ? seniorityLabel(role.seniority) : null,
              myMatches > 0 && `${myMatches} of your candidates match`,
            )}
          </p>
        </div>
        <div className="shrink-0 sm:text-right">
          {payout ? (
            <p className={`text-[19px] font-semibold tracking-[-0.02em] ${FOREST}`}>{payout}</p>
          ) : (
            <p className="text-[15px] font-semibold text-[#9C9C95]">Payout depends on the offer</p>
          )}
          <p className={META}>{payout ? 'to you on placement · ' : ''}{feeExplanation(fee)}</p>
        </div>
      </div>
      <div className="mt-3 max-w-[320px]">
        <StageStrip stage={role.search_stage} movedAt={role.stage_moved_at} compact />
      </div>
      <div className="mt-4">
        <ProposalActions assignmentId={assignment.id} why={assignment.why} proposedAt={assignment.proposed_at} expiresAt={assignment.expires_at} />
      </div>
    </div>
  )
}

// ── working, grouped by client ──────────────────────────────────────────────

export function ClientGroupHeader({
  company,
  onCount,
  totalCount,
  canManage,
}: {
  company: PartnerCompanyView
  onCount: number
  totalCount: number
  canManage: boolean
}) {
  const meta = detailLine(
    stageLabel(company.stage),
    company.location,
    canManage ? `${totalCount} live ${totalCount === 1 ? 'search' : 'searches'}` : `you are on ${onCount} of ${totalCount} ${totalCount === 1 ? 'search' : 'searches'}`,
  )
  return (
    <div className="flex flex-wrap items-center gap-3 px-1 pt-2">
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-[#161613] text-[11px] font-bold text-white">
        {initials(company.name)}
      </span>
      <Link href={`/searches/${company.companyId}`} className={`text-[15px] font-semibold text-[#161613] underline-offset-4 hover:underline ${FOCUS}`}>
        {company.name}
      </Link>
      <span className={META}>{meta}</span>
      {company.briefPublished && (
        <Link
          href={`/searches/${company.companyId}/brief`}
          className={`ml-auto inline-flex items-center gap-1.5 text-[12.5px] font-semibold ${FOREST} ${FOCUS}`}
        >
          <FileText className="h-3.5 w-3.5" />
          Client brief
        </Link>
      )}
    </div>
  )
}

export interface MineOnRole {
  /** My submissions on this role by status value. */
  byStatus: Record<string, number>
  matches: number
}

export function WorkingRow({ role, mine, isAdmin }: { role: PartnerRoleRow; mine: MineOnRole; isAdmin: boolean }) {
  const fee = resolveFee(role)
  const payout = payoutAmount(fee)
  const inPlay = Object.entries(mine.byStatus).filter(([s]) => submissionStatus(s).category === 'in_progress')
  const href = `/searches/${role.company_id}/roles/${role.job_id}`

  return (
    <div className={`flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:gap-6 ${CARD}`}>
      <div className="sm:w-[150px] sm:shrink-0">
        {payout ? (
          <p className={`text-[21px] font-semibold leading-none tracking-[-0.02em] ${FOREST}`}>{payout}</p>
        ) : (
          <p className="text-[17px] font-semibold leading-none text-[#9C9C95]">—</p>
        )}
        <p className={`mt-1.5 ${META}`}>{feeExplanation(fee)}</p>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={href} className={`${H3} underline-offset-4 hover:underline ${FOCUS}`}>
            {role.headline || role.title}
          </Link>
          {role.priority === 'urgent' && <span className={CHIP_BAD}>Urgent</span>}
          {role.priority === 'high' && <span className={CHIP_WARN}>Priority</span>}
          {role.exclusivity === 'exclusive' && <span className={CHIP_VALUE}>Exclusive</span>}
        </div>
        <p className={`mt-1 ${META}`}>
          {detailLine(
            role.company_name,
            role.location,
            role.remote_policy ? REMOTE_LABELS[role.remote_policy] : null,
            role.seniority ? seniorityLabel(role.seniority) : null,
          )}
        </p>
        <p className={`mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 ${META}`}>
          {inPlay.length ? (
            inPlay.map(([status, n]) => {
              const meta = submissionStatus(status)
              return (
                <span key={status} className="inline-flex items-center gap-1.5">
                  <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                  {n} {meta.label.toLowerCase()}
                </span>
              )
            })
          ) : (
            <span>{isAdmin ? 'Nothing in play yet' : 'Nothing from you yet'}</span>
          )}
          {!isAdmin && inPlay.length > 0 && <span>· yours</span>}
          {mine.matches > 0 && (
            <span className={`inline-flex items-center gap-1 font-semibold ${FOREST}`}>
              <Sparkles className="h-3 w-3" />
              {mine.matches} of your candidates match
            </span>
          )}
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:w-[240px] sm:shrink-0 sm:items-end">
        <div className="w-full">
          <StageStrip stage={role.search_stage} movedAt={role.stage_moved_at} isOpen compact />
        </div>
        <Link
          href={href}
          className={`inline-flex min-h-[36px] items-center justify-center rounded-full border border-[#1F3A2F] px-3.5 text-[13px] font-semibold text-[#1F3A2F] transition-colors hover:bg-[#E7EDE9] ${FOCUS}`}
        >
          {isAdmin ? 'Open the search' : 'Submit a candidate'}
        </Link>
      </div>
    </div>
  )
}

// ── on request ──────────────────────────────────────────────────────────────

export function OnRequestRow({
  role,
  companyLabel,
  requestAccess,
}: {
  role: PartnerRoleRow
  companyLabel: string
  requestAccess: React.ReactNode
}) {
  const fee = resolveFee(role)
  const payout = payoutAmount(fee)
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
      <Lock className="hidden h-3.5 w-3.5 shrink-0 text-[#9C9C95] sm:block" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-[#161613]">{role.headline || role.title}</p>
        <p className={META}>
          {detailLine(companyLabel, role.location, role.remote_policy ? REMOTE_LABELS[role.remote_policy] : null)}
        </p>
      </div>
      <div className="w-full sm:w-[150px]">
        <StageStrip stage={role.search_stage} movedAt={role.stage_moved_at} compact />
      </div>
      <p className={`text-[15px] font-semibold ${FOREST} sm:w-[130px] sm:text-right`}>{payout ?? '—'}</p>
      <div className="shrink-0">{requestAccess}</div>
    </div>
  )
}

// ── the rail ────────────────────────────────────────────────────────────────

export interface WeekItem {
  lead: string
  text: string
  at: string
  tone: string
}

export function ThisWeek({ items }: { items: WeekItem[] }) {
  return (
    <div className={`p-5 ${CARD}`}>
      <h3 className={H3}>This week</h3>
      {items.length === 0 ? (
        <p className={`mt-3 ${LEDE}`}>Nothing of yours moved in the last seven days. When it does, the note that explains it lands here.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {items.slice(0, 6).map((item, i) => (
            <li key={i} className="flex gap-2.5 text-[13.5px] leading-relaxed text-[#2A2A26]">
              <span aria-hidden className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${item.tone}`} />
              <span>
                <span className="font-semibold">{item.lead}</span> {item.text}
                <span className={`block ${META}`}>{shortAge(item.at)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** The viewer's own funnel, three figures deep: in play, interviewing, offers out. */
export function Numbers({ inPlay, interviewing, offers }: { inPlay: number; interviewing: number; offers: number }) {
  return (
    <dl className={`grid grid-cols-3 gap-4 p-5 ${CARD}`}>
      <div>
        <dt className={FIGURE}>{inPlay}</dt>
        <dd className={`mt-1.5 ${LABEL}`}>in play</dd>
      </div>
      <div>
        <dt className={FIGURE}>{interviewing}</dt>
        <dd className={`mt-1.5 ${LABEL}`}>interviewing</dd>
      </div>
      <div>
        <dt className={FIGURE}>{offers}</dt>
        <dd className={`mt-1.5 ${LABEL}`}>{offers === 1 ? 'offer out' : 'offers out'}</dd>
      </div>
    </dl>
  )
}

export function IntroduceCompany() {
  return (
    <div className={`p-5 ${WELL}`}>
      <p className="text-[14.5px] font-semibold text-[#161613]">Know a startup that is hiring?</p>
      <p className={`mt-1 ${LEDE}`}>Introduce them and earn 10% of the fee on every hire there for 24 months, on top of your placements.</p>
      <a
        href="mailto:hello@refery.io?subject=Introducing%20a%20company"
        className={`mt-2 inline-flex items-center gap-1.5 text-[13.5px] font-semibold ${FOREST} ${FOCUS}`}
      >
        Introduce a company →
      </a>
    </div>
  )
}

export { RULE }
