import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { H2, LEDE, META } from '@/lib/desk-ui'
import { FOCUS } from '@/lib/candidate-ui'

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

interface BenchRow {
  candidateId: string
  name: string
  grade: string | null
  met: boolean
  ownerName: string | null
  ownerId: string | null
  reason: string
  blockers: string[]
  fit: string
  state: string
  stateTone: 'do' | 'chase' | 'quiet'
}

/**
 * Who on the bench fits this seat, and where each of them is.
 *
 * Read from the panels (every candidate's seat fits) and the bench runs. The
 * super admin sees everyone with owner and state. A partner on the search
 * sees the count and their own people only.
 */
export async function BenchBlock({ jobId, viewerId, canManage }: { jobId: string; viewerId: string; canManage: boolean }) {
  const admin = createAdminClient()

  const [{ data: panels }, { data: runs }] = await Promise.all([
    admin.from('candidate_panels').select('candidate_id, grade, seat_fits, created_at').order('created_at', { ascending: false }).limit(600),
    admin.from('search_match_runs').select('results, created_at').eq('job_id', jobId).order('created_at', { ascending: false }).limit(5),
  ])

  const latest = new Map<string, { grade: string; fit: string; reason: string; blockers: string[] }>()
  for (const p of panels ?? []) {
    const cid = p.candidate_id as string
    if (latest.has(cid)) continue
    const fits = (p.seat_fits as { job_id: string; fit: string; reason: string; blockers?: string[] }[]) ?? []
    const f = fits.find(x => x.job_id === jobId)
    if (f && f.fit !== 'no') latest.set(cid, { grade: p.grade as string, fit: f.fit, reason: f.reason, blockers: f.blockers ?? [] })
  }
  for (const r of runs ?? []) {
    for (const x of (r.results as { candidate_id: string; fit: string; reason: string; blockers?: string[] }[]) ?? []) {
      if (x.fit === 'no' || latest.has(x.candidate_id)) continue
      latest.set(x.candidate_id, { grade: '', fit: x.fit, reason: x.reason, blockers: x.blockers ?? [] })
    }
  }
  if (!latest.size) return null

  const ids = [...latest.keys()]
  const [{ data: cands }, { data: emails }, { data: subs }] = await Promise.all([
    admin.from('candidates').select('id, name, panel_grade, journey_stage, owner_user_id, lily_verdict, intake_source, availability_status').in('id', ids),
    admin.from('candidate_emails').select('candidate_id, kind, sent_at, meta').in('candidate_id', ids).not('sent_at', 'is', null).order('sent_at', { ascending: false }),
    admin.from('role_submissions').select('candidate_id, status').eq('job_id', jobId).in('candidate_id', ids),
  ])
  const ownerIds = [...new Set((cands ?? []).map(c => c.owner_user_id as string).filter(Boolean))]
  const { data: owners } = ownerIds.length ? await admin.from('users_admin').select('user_id, full_name, email').in('user_id', ownerIds) : { data: [] }
  const ownerName = new Map((owners ?? []).map(o => [o.user_id as string, ((o.full_name as string) || (o.email as string)).split(' ')[0]]))
  const submitted = new Map((subs ?? []).map(s => [s.candidate_id as string, s.status as string]))

  const rows: BenchRow[] = []
  for (const c of cands ?? []) {
    if (c.intake_source === 'calibration') continue
    if (['not_fit', 'post_committee_not_fit', 'placed'].includes(String(c.journey_stage))) continue
    const info = latest.get(c.id as string)!
    const mine = (emails ?? []).filter(e => e.candidate_id === c.id)
    const blurb = mine.find(e => e.kind === 'hm_blurb' && (e.meta as { job_id?: string })?.job_id === jobId)
    const ask = mine.find(e => String(e.kind).startsWith('decision_intro_now') || e.kind === 'direct_after_referrer' || e.kind === 'direct_for_partner')
    const sub = submitted.get(c.id as string)
    let state = 'on the bench'
    let tone: BenchRow['stateTone'] = 'quiet'
    if (sub) {
      state = `submitted · ${sub.replace(/_/g, ' ')}`
      tone = 'do'
    } else if (blurb) {
      state = `blurb sent ${fmt(blurb.sent_at as string)} · feedback due`
      tone = 'chase'
    } else if (String(c.journey_stage) === 'committee_call') {
      state = 'call booked'
      tone = 'do'
    } else if (String(c.journey_stage) === 'intro_sent') {
      state = `emailed${ask ? ` ${fmt(ask.sent_at as string)}` : ''} · waiting to book`
      tone = 'quiet'
    } else if (String(c.journey_stage) === 'intro_requested') {
      state = `intro asked${ask ? ` ${fmt(ask.sent_at as string)}` : ''}`
      tone = 'chase'
    } else if (String(c.journey_stage) === 'warm') {
      state = 'warm · not yet shown to the founder'
      tone = 'do'
    } else if (c.availability_status === 'off_market') {
      state = 'off market'
    }
    rows.push({
      candidateId: c.id as string,
      name: c.name as string,
      grade: (c.panel_grade as string) || info.grade || null,
      met: String(c.journey_stage) === 'warm' || String(c.journey_stage) === 'committee_call' || !!c.lily_verdict,
      ownerName: ownerName.get(c.owner_user_id as string) ?? null,
      ownerId: (c.owner_user_id as string) ?? null,
      reason: info.reason,
      blockers: info.blockers,
      fit: info.fit,
      state,
      stateTone: tone,
    })
  }
  rows.sort((a, b) => Number(b.fit === 'strong') - Number(a.fit === 'strong') || Number(b.met) - Number(a.met))
  if (!rows.length) return null

  const visible = canManage ? rows : rows.filter(r => r.ownerId === viewerId)
  const inPlay = rows.filter(r => r.stateTone !== 'quiet').length

  return (
    <section className="mt-9">
      <h2 className={H2}>
        On the bench for this seat
        <span className="ml-2 text-[15px] text-[#9C9C95]">{rows.length}</span>
      </h2>
      <p className={`mt-1 max-w-xl ${LEDE}`}>
        {canManage
          ? 'People the panel or the Monday re-match rated strong or possible here, and where each one is. Act from the Slack card or the profile.'
          : `${rows.length === 1 ? 'One person' : `${rows.length} people`} from the Refery bench fit this seat${inPlay ? `, ${inPlay} in play` : ''}. ${visible.length ? 'Yours are listed below.' : 'None of them are yours.'}`}
      </p>
      {visible.length > 0 && (
        <div className="mt-4 divide-y divide-[#E4E3DC] rounded-[16px] border border-[#E4E3DC] bg-white">
          {visible.map(r => (
            <Link key={r.candidateId} href={`/candidates/${r.candidateId}`} className={`grid gap-2 px-4 py-3 transition-colors hover:bg-[#FAF9F5] sm:grid-cols-[1.6fr_1.2fr_1fr] sm:items-center ${FOCUS}`}>
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold text-[#161613]">
                  {r.grade && <span className="mr-2 rounded-md bg-[#1F3A2F] px-1.5 py-0.5 text-[11.5px] font-bold text-white">{r.grade}</span>}
                  {r.name}
                </p>
                <p className={`truncate ${META}`}>
                  {r.reason}
                  {r.met ? ' · met' : ' · not met'}
                  {canManage && r.ownerName ? ` · ${r.ownerName}` : ''}
                </p>
              </div>
              <p className={`text-[12.5px] ${r.blockers.length ? 'text-[#8A6A1F]' : 'text-[#9C9C95]'}`}>{r.blockers.length ? `⚠ ${r.blockers.join('; ')}` : r.fit}</p>
              <p className={`text-[12.5px] font-semibold ${r.stateTone === 'do' ? 'text-[#1F3A2F]' : r.stateTone === 'chase' ? 'text-[#8A6A1F]' : 'text-[#9C9C95]'}`}>{r.state}</p>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
