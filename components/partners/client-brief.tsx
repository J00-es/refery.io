import Link from 'next/link'
import { Check, ExternalLink, Lock } from 'lucide-react'
import {
  BODY,
  BTN_PRIMARY,
  BTN_QUIET,
  CARD,
  CHIP,
  CHIP_BAD,
  CHIP_VALUE,
  CHIP_WARN,
  FOCUS,
  FOREST,
  H1,
  LEDE,
  META,
  MUTED,
  RULE,
  detailLine,
} from '@/lib/desk-ui'
import { REMOTE_LABELS, formatSalary, shortAge } from '@/lib/job-ui'
import { feeExplanation, payoutAmount, resolveFee } from '@/lib/fees'
import type { BarGroup, BriefBlock, BriefContent, BriefSection, CardItem, QuestionItem } from '@/lib/brief'
import {
  PRIORITY_META,
  searchStageMeta,
  slotsLeft,
  submissionStatus,
  type PartnerCompanyView,
  type PartnerRoleRow,
  type SearchAssignmentRow,
} from '@/lib/partners'
import { Block } from './brief-document'
import { Inline } from './brief-inline'
import { CopyButton } from './copy-button'
import { ProposalActions } from './proposal-card'
import { RequestAccess } from './request-access'
import { StageStrip } from './stage-strip'
import { SubmitCandidates } from './submit-candidates'

/**
 * The client brief, the way the canvas drew it (artboard 2b).
 *
 * One page per client, shared by every search there. It is the brief Lily
 * already writes, rendered live rather than as a file: the masthead says which
 * searches the reader is on, the TL;DR carries a ledger of the live searches
 * with what each pays, and the searches section is generated from the desk so
 * each seat has its own stage, its own confirm or submit button, and the
 * reader's own match count. Everything else comes from partner_briefs.content.
 *
 * Nothing here ever shows a count of other partners or their candidates. The
 * rail is the reader's own activity only.
 */

export interface ClientBriefSubmission {
  id: string
  jobId: string
  candidateName: string | null
  status: string
  createdAt: string
}

export interface ClientBriefProps {
  company: PartnerCompanyView
  brief: {
    content: BriefContent
    status: string
    version: number
    publishedAt: string | null
    updatedAt: string | null
  } | null
  /** Live, open searches at this client, priority first. */
  roles: PartnerRoleRow[]
  /** The reader's own assignment per search. */
  assignmentByJob: Record<string, SearchAssignmentRow | undefined>
  /** Whether the reader may submit to each search. */
  canWorkByJob: Record<string, boolean>
  /** How many of the reader's own candidates the matcher paired with each search. */
  matchesByJob: Record<string, number>
  /** The reader's own submissions at this client, newest first. */
  mySubmissions: ClientBriefSubmission[]
  isAdmin: boolean
  /** Rendered between the masthead and the TL;DR, for the admin's setup panel. */
  adminSlot?: React.ReactNode
}

// ── small pieces ─────────────────────────────────────────────────────────────

const NUM = 'text-[12px] font-semibold tracking-[0.04em] text-[#9C9C95]'
const H2S = 'text-[21px] font-semibold leading-tight text-[#161613]'
const FACT_TH = 'w-[150px] border-b border-[#E9E8E1] bg-[#FAF9F5] px-4 py-3 text-left align-top text-[13.5px] font-semibold text-[#2A2A26]'
const FACT_TD = 'border-b border-[#E9E8E1] px-4 py-3 align-top text-[14px] leading-relaxed text-[#2A2A26]'

function longDate(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** "Strong engineer first. Shipped production code…" → bold lead, plain rest. */
function splitLead(text: string): { lead: string; rest: string } {
  const m = text.match(/^([^]{4,80}?[.!?])\s+([^]*)$/)
  return m ? { lead: m[1], rest: m[2] } : { lead: text, rest: '' }
}

/** Ticks and crosses, in the desk palette rather than the document's gold. */
function Tick({ tone, children }: { tone: 'must' | 'nice' | 'no'; children: React.ReactNode }) {
  const glyph = tone === 'must' ? '✓' : tone === 'nice' ? '○' : '✕'
  const color = tone === 'must' ? 'text-[#1F3A2F]' : tone === 'nice' ? 'text-[#9C9C95]' : 'text-[#9C3F37]'
  return (
    <li className="flex gap-2.5 text-[14px] leading-relaxed text-[#2A2A26]">
      <span aria-hidden className={`w-4 shrink-0 text-center font-bold ${color}`}>
        {glyph}
      </span>
      <span>{children}</span>
    </li>
  )
}

function Facts({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <div className={`overflow-hidden ${CARD}`}>
      <table className="hidden w-full border-collapse sm:table">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="last:[&>*]:border-b-0">
              <th scope="row" className={FACT_TH}>{r.label}</th>
              <td className={FACT_TD}><Inline text={r.value} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="divide-y divide-[#E9E8E1] sm:hidden">
        {rows.map((r, i) => (
          <div key={i} className="px-4 py-3">
            <dt className="text-[12px] font-semibold text-[#6E6E68]">{r.label}</dt>
            <dd className={`mt-1 ${BODY}`}><Inline text={r.value} /></dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** The hiring manager's words: question, quote, then the "Read:" line for the partner. */
function HmWords({ items }: { items: CardItem[] }) {
  return (
    <div className="space-y-3">
      {items.map((c, i) => {
        const body = c.body ?? ''
        const cut = body.search(/\bRead:\s*/i)
        const quote = (cut >= 0 ? body.slice(0, cut) : body).trim()
        const read = cut >= 0 ? body.slice(cut).replace(/^Read:\s*/i, '').trim() : ''
        return (
          <div key={i} className={`p-5 ${CARD}`}>
            <p className={`${NUM}`}>Q · {c.title}</p>
            {quote && <p className={`mt-2 text-[15px] leading-relaxed text-[#161613]`}>{quote}</p>}
            {read && (
              <p className={`mt-2.5 ${LEDE}`}>
                <span className={`font-semibold ${FOREST}`}>Read: </span>
                {read}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Screening({ items }: { items: QuestionItem[] }) {
  return (
    <ol className="space-y-3">
      {items.map((q, i) => (
        <li key={i} className={`flex gap-4 p-5 ${CARD}`}>
          <span className={`${NUM} pt-0.5`}>{String(i + 1).padStart(2, '0')}</span>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold leading-snug text-[#161613]">{q.question}</p>
            {q.looking_for && (
              <p className={`mt-1.5 ${LEDE}`}>
                <span className={`font-semibold ${FOREST}`}>Looking for: </span>
                <Inline text={q.looking_for} />
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}

function BarColumns({ groups }: { groups: BarGroup[] }) {
  const label = (g: BarGroup) =>
    g.tone === 'must' ? 'Non-negotiable' : g.tone === 'nice' ? 'Explicitly not required' : 'What will not clear'
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {groups.map((g, i) => (
        <div key={i} className={`p-5 ${CARD}`}>
          <p className={`text-[12px] font-semibold ${g.tone === 'no' ? 'text-[#9C3F37]' : g.tone === 'nice' ? 'text-[#6E6E68]' : FOREST}`}>
            {g.heading || label(g)}
          </p>
          <ul className="mt-3 space-y-2.5">
            {g.items.map((item, j) => {
              const { lead, rest } = splitLead(item)
              return (
                <Tick key={j} tone={g.tone}>
                  <b className="font-semibold text-[#161613]"><Inline text={lead} /></b>
                  {rest && <span className="text-[#6E6E68]"> <Inline text={rest} /></span>}
                </Tick>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}

function Pools({ items }: { items: CardItem[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((c, i) => (
        <div key={i} className={`p-4 ${CARD}`}>
          <p className="text-[14.5px] font-semibold text-[#161613]">{c.title}</p>
          {c.body && <p className={`mt-1 ${LEDE}`}><Inline text={c.body} /></p>}
        </div>
      ))}
    </div>
  )
}

function Blurb({ block }: { block: Extract<BriefBlock, { kind: 'blurb' }> }) {
  return (
    <div className={`overflow-hidden ${CARD}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4E3DC] bg-[#FAF9F5] px-5 py-3">
        <p className={META}>{block.label ?? 'Copy to adapt'}{block.note ? ` · ${block.note}` : ' · adapt to the person, never send raw'}</p>
        <CopyButton text={block.paragraphs.join('\n\n')} label="Copy blurb" />
      </div>
      <div className="space-y-3 px-5 py-5">
        {block.paragraphs.map((p, i) => (
          <p key={i} className="text-[15px] leading-[1.7] text-[#161613]"><Inline text={p} /></p>
        ))}
      </div>
      <p className={`border-t border-[#E4E3DC] px-5 py-3 ${META}`}>Safe to send cold or post abridged. Nothing in it identifies the company.</p>
    </div>
  )
}

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="grid gap-3 sm:grid-cols-3">
      {items.map((item, i) => (
        <li key={i} className={`p-4 ${CARD}`}>
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#E7EDE9] text-[12px] font-bold text-[#1F3A2F]">{i + 1}</span>
          <p className={`mt-2.5 ${BODY}`}><Inline text={item} /></p>
        </li>
      ))}
    </ol>
  )
}

/** A brief block in the desk's own clothes. Rare kinds fall back to the document renderer. */
function DeskBlock({ block, sectionId }: { block: BriefBlock; sectionId: string }) {
  switch (block.kind) {
    case 'lede':
      return <p className="text-[16px] leading-relaxed text-[#161613]"><Inline text={block.text} /></p>
    case 'paragraph':
      return <p className={block.tone === 'note' ? LEDE : BODY}><Inline text={block.text} /></p>
    case 'stats':
      return (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {block.items.map((s, i) => (
            <div key={i} className={`p-4 ${CARD}`}>
              <dt className="text-[22px] font-semibold leading-none tracking-[-0.02em] text-[#161613]">{s.value}</dt>
              <dd className={`mt-1.5 text-[13px] text-[#9C9C95]`}>{s.label}</dd>
            </div>
          ))}
        </dl>
      )
    case 'bullets':
      return (
        <ul className="space-y-2">
          {block.items.map((item, i) => (
            <li key={i} className={`relative pl-4 ${BODY}`}>
              <span aria-hidden className="absolute left-0 top-[9px] h-1.5 w-1.5 rounded-full bg-[#1F3A2F]" />
              <Inline text={item} />
            </li>
          ))}
        </ul>
      )
    case 'callout':
      return (
        <aside className="rounded-[12px] bg-[#E7EDE9] px-5 py-4">
          <p className="text-[14.5px] font-semibold leading-relaxed text-[#1F3A2F]"><Inline text={block.text} /></p>
        </aside>
      )
    case 'people':
      return (
        <div>
          <div className="grid gap-3 sm:grid-cols-2">
            {block.items.map((p, i) => (
              <div key={i} className={`flex gap-3 p-4 ${CARD}`}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E7EDE9] text-[12px] font-bold text-[#1F3A2F]">
                  {p.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="text-[14.5px] font-semibold text-[#161613]">
                    {p.name}
                    {p.role && <span className={`font-normal ${MUTED}`}> · {p.role}</span>}
                    {p.linkedin && (
                      <a href={p.linkedin} target="_blank" rel="noopener noreferrer" className={`ml-2 text-[12.5px] font-semibold ${FOREST} ${FOCUS}`}>LinkedIn</a>
                    )}
                  </p>
                  {p.note && <p className={`mt-1 ${LEDE}`}><Inline text={p.note} /></p>}
                </div>
              </div>
            ))}
          </div>
          {block.footer && (
            <p className={`mt-3 ${BODY}`}>
              <span className={`font-semibold ${FOREST}`}>What this means for your pitch: </span>
              <Inline text={block.footer} />
            </p>
          )}
        </div>
      )
    case 'bar':
      return <BarColumns groups={block.groups} />
    case 'facts':
      return <Facts rows={block.rows} />
    case 'cards':
      return sectionId === 'hm' ? <HmWords items={block.items} /> : <Pools items={block.items} />
    case 'questions':
      return <Screening items={block.items} />
    case 'blurb':
      return <Blurb block={block} />
    case 'steps':
      return <Steps items={block.items} />
    case 'roles':
      // The live searches section replaces the brief's own copy of the roles.
      return null
    default:
      return <Block block={block} />
  }
}

// ── the searches, generated from the desk ────────────────────────────────────

function SearchCard({
  role,
  index,
  companyId,
  assignment,
  canWork,
  matches,
  company,
  isAdmin,
}: {
  role: PartnerRoleRow
  index: number
  companyId: string
  assignment: SearchAssignmentRow | undefined
  canWork: boolean
  matches: number
  company: PartnerCompanyView
  isAdmin: boolean
}) {
  const fee = resolveFee(role)
  const payout = payoutAmount(fee)
  const slots = slotsLeft(role)
  const closed = !role.is_live || role.job_status !== 'open'
  const priority = PRIORITY_META[role.priority] ?? PRIORITY_META.normal
  const href = `/searches/${companyId}/roles/${role.job_id}`
  const meta = detailLine(role.department, role.location, role.remote_policy ? REMOTE_LABELS[role.remote_policy] : null)
  const comp = detailLine(formatSalary(role.salary_min, role.salary_max), payout ? `${payout} to you` : null)

  return (
    <article className={`p-5 sm:p-6 ${CARD}`}>
      <div className="flex flex-wrap items-start gap-3">
        <span className={`${NUM} pt-1`}>{index + 1}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[19px] font-semibold leading-snug text-[#161613]">
              <Link href={href} className={`hover:underline underline-offset-4 ${FOCUS}`}>{role.headline || role.title}</Link>
            </h3>
            {role.priority !== 'normal' && <span className={role.priority === 'urgent' ? CHIP_BAD : CHIP_WARN}>{priority.label}</span>}
            {assignment?.status === 'working' && <span className={CHIP_VALUE}>you are working this</span>}
            {assignment?.status === 'proposed' && <span className={CHIP_WARN}>proposed to you</span>}
          </div>
          {meta && <p className={`mt-1 ${META}`}>{meta}</p>}
          {comp && <p className={`mt-1.5 text-[14px] font-semibold ${FOREST}`}>{comp}</p>}
          {payout && <p className={META}>{feeExplanation(fee)}</p>}
        </div>
        <div className="w-full sm:w-[190px]">
          <StageStrip stage={role.search_stage} movedAt={role.stage_moved_at} isOpen={!closed} compact />
        </div>
      </div>

      {role.context && <p className={`mt-4 ${BODY}`}>{role.context}</p>}

      {(!!role.hard_requirements?.length || !!role.intake_notes?.length) && (
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          {!!role.hard_requirements?.length && (
            <div>
              <p className="text-[12.5px] font-semibold text-[#6E6E68]">Hard requirements · from the JD</p>
              <ul className="mt-2 space-y-1.5">
                {role.hard_requirements.map((line, i) => (
                  <li key={i} className={`relative pl-4 ${BODY}`}>
                    <span aria-hidden className="absolute left-0 top-[9px] h-1.5 w-1.5 rounded-full bg-[#1F3A2F]" />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!!role.intake_notes?.length && (
            <div>
              <p className="text-[12.5px] font-semibold text-[#8A6A1F]">From the intake call</p>
              <ul className="mt-2 space-y-1.5">
                {role.intake_notes.map((line, i) => (
                  <li key={i} className={`relative pl-4 ${BODY}`}>
                    <span aria-hidden className="absolute left-0 top-[9px] h-1.5 w-1.5 rounded-full bg-[#C79A2E]" />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {role.not_for && (
        <p className={`mt-4 border-t border-dashed border-[#D2D1C7] pt-3 ${LEDE}`}>
          <span className="font-semibold text-[#9C3F37]">Not for: </span>
          {role.not_for}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[#E4E3DC] pt-4">
        {assignment?.status === 'proposed' ? (
          <ProposalActions assignmentId={assignment.id} why={assignment.why} proposedAt={assignment.proposed_at} expiresAt={assignment.expires_at} compact />
        ) : canWork && !closed && slots !== 0 ? (
          <SubmitCandidates jobId={role.job_id} roleTitle={`${role.title} · ${company.name}`} slotsLeft={slots} label="Submit a candidate" />
        ) : !closed && !isAdmin ? (
          <RequestAccess companyId={companyId} companyLabel={`${role.headline || role.title} at ${company.name}`} pending={company.requestPending} />
        ) : null}
        <Link href={href} className={`${BTN_QUIET} min-h-[40px] px-4 text-[13.5px]`}>
          Open this search: your candidates and pipeline
        </Link>
        {matches > 0 && (
          <span className={`ml-auto ${META}`}>
            {matches} of your candidates {matches === 1 ? 'matches' : 'match'}
          </span>
        )}
      </div>
    </article>
  )
}

// ── the page ─────────────────────────────────────────────────────────────────

export function ClientBrief(p: ClientBriefProps) {
  const { company, brief, roles, isAdmin } = p
  const content = brief?.content
  const sections = (content?.sections ?? []).filter(s => s.blocks.length)

  const working = roles.filter(r => p.assignmentByJob[r.job_id]?.status === 'working' || (p.canWorkByJob[r.job_id] && !p.assignmentByJob[r.job_id]))
  const proposed = roles.filter(r => p.assignmentByJob[r.job_id]?.status === 'proposed')
  const firstWorking = working[0] ?? roles[0]

  // TL;DR ingredients, lifted from the brief without rendering those sections twice.
  const tldr = sections.find(s => s.id === 'tldr')
  const companySec = sections.find(s => s.id === 'company')
  const tldrLede = tldr?.blocks.find(b => b.kind === 'lede') ?? companySec?.blocks.find(b => b.kind === 'lede')
  const tldrParas = (tldr?.blocks.filter(b => b.kind === 'paragraph') ?? []) as Extract<BriefBlock, { kind: 'paragraph' }>[]
  const bar = sections.flatMap(s => s.blocks).find(b => b.kind === 'bar') as Extract<BriefBlock, { kind: 'bar' }> | undefined
  const must = bar?.groups.find(g => g.tone === 'must')
  const no = bar?.groups.find(g => g.tone === 'no')

  // Body sections: the brief's own, minus the TL;DR (rendered above), with the
  // live searches inserted where the brief talks about roles, else before the bar.
  const body = sections.filter(s => s.id !== 'tldr')
  const rolesIdx = body.findIndex(s => s.id === 'roles' || s.blocks.some(b => b.kind === 'roles'))
  const barIdx = body.findIndex(s => s.id === 'bar')
  const insertAt = rolesIdx >= 0 ? rolesIdx : barIdx >= 0 ? barIdx : Math.min(1, body.length)
  type Rendered = { id: string; label: string; heading: string; node: React.ReactNode }
  const rendered: Rendered[] = []
  const pushBrief = (s: BriefSection) => {
    const blocks = s.blocks.filter(b => b.kind !== 'roles')
    if (!blocks.length && s.id === 'roles') return
    rendered.push({
      id: s.id,
      label: s.nav ?? s.heading,
      heading: s.heading,
      node: (
        <div className="space-y-4">
          {s.summary && <p className={`text-[15px] leading-relaxed text-[#6E6E68]`}><Inline text={s.summary} /></p>}
          {blocks.map((b, i) => <DeskBlock key={i} block={b} sectionId={s.id} />)}
        </div>
      ),
    })
  }
  body.slice(0, insertAt).forEach(pushBrief)
  if (roles.length) {
    rendered.push({
      id: 'searches',
      label: roles.length === 1 ? 'The search' : `The ${roles.length} searches`,
      heading: roles.length === 1 ? 'The search' : `The ${roles.length === 2 ? 'two' : roles.length} searches`,
      node: (
        <div className="space-y-4">
          <p className={LEDE}>
            In the hiring manager’s priority order. Each is its own search: you confirm, submit and track per role.
          </p>
          {roles.map((r, i) => (
            <SearchCard
              key={r.job_id}
              role={r}
              index={i}
              companyId={company.companyId}
              assignment={p.assignmentByJob[r.job_id]}
              canWork={!!p.canWorkByJob[r.job_id]}
              matches={p.matchesByJob[r.job_id] ?? 0}
              company={company}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      ),
    })
  }
  body.slice(insertAt).forEach(pushBrief)

  const website = company.website?.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') ?? null
  const issued = longDate(brief?.publishedAt ?? null)
  const updated = brief?.updatedAt ? shortAge(brief.updatedAt) : null
  const onLine =
    isAdmin
      ? `${roles.length} live ${roles.length === 1 ? 'search' : 'searches'} here`
      : working.length
        ? `You are on ${working.length} of the ${roles.length} ${roles.length === 1 ? 'search' : 'searches'} here`
        : proposed.length
          ? `${proposed.length} of the ${roles.length} searches here ${proposed.length === 1 ? 'is' : 'are'} proposed to you`
          : `${roles.length} live ${roles.length === 1 ? 'search' : 'searches'} here`

  const confidentialPara =
    content?.confidential?.paragraphs.find(x => /company name/i.test(x)) ??
    'When approaching a candidate, use the blurb below and do not send links that name the company. Once a candidate is in, share the founders and this brief freely.'

  return (
    <div className="mx-auto max-w-[1180px] px-1 pb-16 sm:px-0">
      <Link href="/searches" className={`inline-flex items-center gap-1.5 text-[13.5px] font-medium ${MUTED} transition-colors hover:text-[#161613] ${FOCUS}`}>
        ← Searches
      </Link>

      {/* Masthead */}
      <header className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={CHIP}>Client brief</span>
            <span className={META}>{onLine}</span>
            <span className={CHIP_VALUE}><Lock className="h-3 w-3" /> Confidential · Refery partners only</span>
          </div>
          <h1 className={`mt-3 ${H1}`}>{company.name}</h1>
          <p className={`mt-2 ${META}`}>
            {detailLine(
              `Shared by ${roles.length} ${roles.length === 1 ? 'search' : 'searches'}`,
              company.location,
              company.employeeCount,
            )}
            {website && company.unlocked && (
              <>
                {' · '}
                <a href={company.website!} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 ${FOREST} ${FOCUS}`}>
                  {website}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </>
            )}
          </p>
          {brief && (
            <p className={`mt-1 ${META}`}>
              {detailLine(
                issued ? `Brief issued ${issued}` : `Brief v${brief.version}`,
                updated ? `updated ${updated}` : null,
                'contact Lily',
                brief.status !== 'published' ? 'draft, admins only' : null,
              )}
            </p>
          )}
        </div>
        {firstWorking && (
          <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
            <Link href={`/searches/${company.companyId}/roles/${firstWorking.job_id}#questions`} className={`${BTN_QUIET} min-h-[40px] px-4 text-[13.5px]`}>
              Ask a question
            </Link>
            {p.canWorkByJob[firstWorking.job_id] && firstWorking.is_live && firstWorking.job_status === 'open' ? (
              <SubmitCandidates jobId={firstWorking.job_id} roleTitle={`${firstWorking.title} · ${company.name}`} slotsLeft={slotsLeft(firstWorking)} label="Submit a candidate" />
            ) : (
              <Link href="#searches" className={`${BTN_PRIMARY} min-h-[40px] px-4 text-[13.5px]`}>
                See the searches
              </Link>
            )}
          </div>
        )}
      </header>

      {p.adminSlot && <div className="mt-6">{p.adminSlot}</div>}

      {!company.unlocked && (
        <section className={`mt-6 flex flex-col gap-3 p-5 ${CARD}`}>
          <div className="flex items-start gap-2.5">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[#9C9C95]" aria-hidden />
            <div>
              <h2 className="text-[15px] font-semibold text-[#161613]">You are not on this client yet</h2>
              <p className={`mt-1.5 max-w-xl ${LEDE}`}>
                The searches below are real and live. The company’s name, its brief and submitting open up once Refery puts you on one of them.
              </p>
            </div>
          </div>
          <RequestAccess companyId={company.companyId} companyLabel={company.name} pending={company.requestPending} />
        </section>
      )}

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
        <div className="min-w-0 space-y-12">
          {company.unlocked && (
            <aside className="rounded-[14px] bg-[#F5EEDD] px-5 py-4">
              <p className="text-[14px] font-semibold text-[#8A6A1F]">The company name stays with you for now.</p>
              <p className="mt-1 text-[13.5px] leading-relaxed text-[#8A6A1F]"><Inline text={confidentialPara} /></p>
            </aside>
          )}

          {/* TL;DR */}
          {(tldrLede || roles.length || must) && (
            <section id="tldr" className="scroll-mt-24 space-y-5">
              <h2 className={H2S}>TL;DR</h2>
              {tldrLede && tldrLede.kind === 'lede' && (
                <p className="text-[16px] leading-relaxed text-[#161613]"><Inline text={tldrLede.text} /></p>
              )}
              {tldrParas.map((b, i) => <p key={i} className={BODY}><Inline text={b.text} /></p>)}
              {!!roles.length && company.unlocked && (
                <ul className={`divide-y divide-[#E4E3DC] ${CARD}`}>
                  {roles.map(r => {
                    const fee = resolveFee(r)
                    const payout = payoutAmount(fee)
                    const priority = PRIORITY_META[r.priority] ?? PRIORITY_META.normal
                    return (
                      <li key={r.job_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                        <Link href={`/searches/${company.companyId}/roles/${r.job_id}`} className={`text-[14.5px] font-semibold text-[#161613] hover:underline underline-offset-4 ${FOCUS}`}>
                          {r.headline || r.title}
                        </Link>
                        {r.priority !== 'normal' && <span className={r.priority === 'urgent' ? CHIP_BAD : CHIP_WARN}>{priority.label}</span>}
                        <span className={META}>{detailLine(r.location, formatSalary(r.salary_min, r.salary_max))}</span>
                        {payout && <span className={`ml-auto text-[13.5px] font-semibold ${FOREST}`}>{payout} to you</span>}
                      </li>
                    )
                  })}
                </ul>
              )}
              {(must || no) && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {must && (
                    <div>
                      <p className={`text-[12.5px] font-semibold ${FOREST}`}>Who clears the bar</p>
                      <ul className="mt-2 space-y-2">
                        {must.items.slice(0, 4).map((item, i) => {
                          const { lead, rest } = splitLead(item)
                          return (
                            <Tick key={i} tone="must">
                              <b className="font-semibold text-[#161613]"><Inline text={lead} /></b>
                              {rest && <span className="text-[#6E6E68]"> <Inline text={rest} /></span>}
                            </Tick>
                          )
                        })}
                      </ul>
                    </div>
                  )}
                  {no && (
                    <div>
                      <p className="text-[12.5px] font-semibold text-[#9C3F37]">Who will not clear</p>
                      <ul className="mt-2 space-y-2">
                        {no.items.slice(0, 4).map((item, i) => (
                          <Tick key={i} tone="no"><Inline text={item} /></Tick>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              {!!roles.length && (
                <div className="flex flex-wrap gap-2">
                  {roles.map(r => {
                    const a = p.assignmentByJob[r.job_id]
                    const stage = searchStageMeta(r.search_stage)
                    return (
                      <Link key={r.job_id} href={`/searches/${company.companyId}/roles/${r.job_id}`} className={`inline-flex flex-wrap items-center gap-2 rounded-full border border-[#E4E3DC] bg-white px-3 py-1.5 text-[12.5px] ${FOCUS}`}>
                        <span className="font-semibold text-[#161613]">{(r.headline || r.title).replace(/\s·.*$/, '')}</span>
                        {a?.status === 'working' && <span className={MUTED}>· you are working this</span>}
                        {a?.status === 'proposed' && <span className="text-[#8A6A1F]">· proposed to you</span>}
                        <span className={`${FOREST} font-semibold`}>{stage.label}</span>
                        {r.stage_moved_at && <span className={MUTED}>moved {shortAge(r.stage_moved_at)}</span>}
                      </Link>
                    )
                  })}
                </div>
              )}
            </section>
          )}

          {/* Numbered sections */}
          {rendered.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-24">
              <div className={`flex items-baseline gap-3 border-b pb-3 ${RULE}`}>
                <span className={NUM}>{String(i + 1).padStart(2, '0')}</span>
                <h2 className={H2S}>{s.heading}</h2>
              </div>
              <div className="mt-5">{s.node}</div>
            </section>
          ))}

          {company.unlocked && (
            <aside className="rounded-[14px] bg-[#F5EEDD] px-5 py-4">
              <p className="text-[14px] font-semibold text-[#8A6A1F]">One check before you submit</p>
              <p className="mt-1 text-[13.5px] leading-relaxed text-[#8A6A1F]">
                Ask whether they have already applied to or been contacted by this company through any other channel. Only fresh introductions are attributable. Surfacing it early protects your referral.
              </p>
            </aside>
          )}

          {content?.signoff && (
            <footer className={`flex flex-wrap items-end justify-between gap-3 border-t pt-5 ${RULE}`}>
              <div>
                <p className="text-[15px] font-semibold text-[#161613]">{content.signoff.name}</p>
                {content.signoff.lines.map((l, i) => <p key={i} className={META}><Inline text={l} /></p>)}
              </div>
              {content.signoff.reminder && <p className={`max-w-sm ${META}`}>{content.signoff.reminder}</p>}
            </footer>
          )}
        </div>

        {/* Rail */}
        <aside className="space-y-4 lg:sticky lg:top-24">
          {rendered.length > 0 && (
            <nav aria-label="On this page" className={`p-4 ${CARD}`}>
              <p className="text-[12.5px] font-semibold text-[#6E6E68]">On this page</p>
              <ol className="mt-2 space-y-1">
                {(tldrLede || roles.length) ? <li><a href="#tldr" className={`block py-0.5 text-[13.5px] text-[#2A2A26] hover:text-[#1F3A2F] ${FOCUS}`}>TL;DR</a></li> : null}
                {rendered.map(s => (
                  <li key={s.id}><a href={`#${s.id}`} className={`block py-0.5 text-[13.5px] text-[#2A2A26] hover:text-[#1F3A2F] ${FOCUS}`}>{s.label}</a></li>
                ))}
              </ol>
            </nav>
          )}

          {company.unlocked && (
            <div className={`p-4 ${CARD}`}>
              <p className="text-[12.5px] font-semibold text-[#6E6E68]">{isAdmin ? `Activity on ${company.name}` : `Your activity on ${company.name}`}</p>
              {p.mySubmissions.length === 0 ? (
                <p className={`mt-2 ${LEDE}`}>Nothing submitted here yet.</p>
              ) : (
                <ul className="mt-2 divide-y divide-[#E4E3DC]">
                  {p.mySubmissions.slice(0, 6).map(s => {
                    const role = roles.find(r => r.job_id === s.jobId)
                    const st = submissionStatus(s.status)
                    return (
                      <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                        <span className="min-w-0">
                          <span className="block truncate text-[13.5px] font-medium text-[#161613]">{s.candidateName ?? 'A candidate'}</span>
                          <span className={`block truncate ${META}`}>{(role?.headline || role?.title || '').replace(/\s·.*$/, '')}</span>
                        </span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.chip}`}>{st.label}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
              {(() => {
                const total = Object.values(p.matchesByJob).reduce((n, v) => n + v, 0)
                return total > 0 ? (
                  <p className={`mt-3 ${LEDE}`}>{total} of your candidates match the bar here and {total === 1 ? 'has' : 'have'} not been submitted.</p>
                ) : null
              })()}
              {firstWorking && (
                <Link href={`/searches/${company.companyId}/roles/${firstWorking.job_id}`} className={`mt-3 inline-flex text-[13px] font-semibold ${FOREST} ${FOCUS}`}>
                  Open your pipeline on this search →
                </Link>
              )}
            </div>
          )}

          {company.unlocked && firstWorking && (
            <div className={`p-4 ${CARD}`}>
              <p className="text-[12.5px] font-semibold text-[#6E6E68]">Questions on fit, comp or process</p>
              <p className={`mt-1.5 ${LEDE}`}>Ask here and the answer is added to the brief for everyone on the search. Lily replies inside a day.</p>
              <Link href={`/searches/${company.companyId}/roles/${firstWorking.job_id}#questions`} className={`${BTN_QUIET} mt-3 min-h-[38px] px-3.5 text-[13px]`}>
                Ask a question
              </Link>
            </div>
          )}

          {working.length > 0 && !isAdmin && (
            <p className={`px-1 ${META}`}>
              <Check className="mr-1 inline h-3 w-3" />
              Anyone you submit here stays yours.
            </p>
          )}
        </aside>
      </div>
    </div>
  )
}
