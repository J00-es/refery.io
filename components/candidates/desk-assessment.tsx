import { createAdminClient } from '@/lib/supabase/server'
import { latestPanel } from '@/lib/desk/panel'
import { loadLiveSeats, seatBand } from '@/lib/desk/seats'
import { tierWord } from '@/lib/desk/tiers'
import { DeskDecisionButtons } from '@/components/candidates/desk-decision-buttons'
import { PartnerIntroButtons } from '@/components/candidates/partner-intro-buttons'
import { CARD } from '@/lib/candidate-ui'
import { journeyConfig, type JourneyStage } from '@/lib/journey'

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/**
 * The panel's read, the seat fits and the timeline of everything the desk did
 * for this person. Mirrors the decision card, and for the super admin carries
 * the same decisions. Partners see the grade, the reasons and the dated
 * timeline of what happened; never the other seats' bands or Lily's notes.
 */
export async function DeskAssessment({
  candidateId,
  journeyStage,
  isSuperAdmin,
  isOwner,
}: {
  candidateId: string
  journeyStage: JourneyStage
  isSuperAdmin: boolean
  isOwner: boolean
}) {
  const admin = createAdminClient()
  const [panel, seats, { data: emails }, { data: decisions }, { data: followups }] = await Promise.all([
    latestPanel(admin, candidateId),
    loadLiveSeats(admin),
    admin.from('candidate_emails').select('kind, to_email, subject, sent_at, error, created_at, meta').eq('candidate_id', candidateId).order('created_at', { ascending: false }).limit(30),
    admin.from('candidate_decisions').select('decision, reason, via, created_at').eq('candidate_id', candidateId).order('created_at', { ascending: false }).limit(10),
    admin.from('candidate_followups').select('kind, due_at, status').eq('candidate_id', candidateId).in('status', ['pending', 'escalated']).order('due_at').limit(5),
  ])

  const bySeat = new Map(seats.map(s => [s.jobId, s]))
  const fits = (panel?.seat_fits ?? []).filter(f => bySeat.has(f.job_id) && f.fit !== 'no')
  const strong = fits.filter(f => f.fit === 'strong')
  const possible = fits.filter(f => f.fit === 'possible')
  const shown = [...strong, ...possible.slice(0, Math.max(0, 3 - strong.length))]
  const others = seats.length - shown.length

  const timeline: { at: string; text: string; tone?: 'warn' }[] = []
  for (const d of decisions ?? []) {
    const label: Record<string, string> = {
      intro_now: 'Lily: intro now',
      bench: 'Lily: bench',
      not_fit: 'Lily: not a fit',
      manual: 'Lily is handling this by hand',
      snooze: 'Snoozed a week',
      route_elsewhere: 'Filed as not a candidate',
      verdict_very_strong: 'After the call: very strong',
      verdict_strong: 'After the call: strong',
      verdict_not_fit: 'After the call: not a fit',
      verdict_hold: 'After the call: on hold',
    }
    timeline.push({ at: d.created_at as string, text: `${label[d.decision as string] ?? d.decision}${d.reason && isSuperAdmin ? ` · "${d.reason}"` : ''}${d.via === 'auto' ? ' (automatic)' : ''}` })
  }
  for (const e of emails ?? []) {
    const isDraft = (e.meta as { draft?: boolean } | null)?.draft && !e.sent_at
    if (isDraft) continue
    const kind = String(e.kind).replace(/_/g, ' ')
    const to = isSuperAdmin || isOwner ? ` to ${e.to_email}` : ''
    timeline.push({ at: (e.sent_at as string) ?? (e.created_at as string), text: e.error ? `${kind}${to} did not send: ${String(e.error).slice(0, 80)}` : `${kind}${to}: "${e.subject}"`, tone: e.error ? 'warn' : undefined })
  }
  timeline.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  const next = (followups ?? []).map(f => `${String(f.kind).replace(/_/g, ' ')} ${f.status === 'escalated' ? '(waiting on Lily)' : `on ${fmt(f.due_at as string)}`}`)
  const stage = journeyConfig(journeyStage)

  return (
    <section className={`${CARD} p-5`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-[#161613]">Panel and desk</h2>
        {panel && (
          <p className="text-[12px] text-[#9C9C95]">
            {fmt(panel.created_at)} · {panel.model.split('/')[1]}
            {isSuperAdmin && panel.cost_usd != null ? ` · $${Number(panel.cost_usd).toFixed(2)}` : ''}
          </p>
        )}
      </div>

      {!panel ? (
        <p className="mt-2 text-[13.5px] text-[#6E6E68]">
          Not read by the panel yet.{' '}
          {isSuperAdmin ? 'Queue it below and the card lands in #refery-desk within a minute.' : "You'll see the read here once it's done."}
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-baseline gap-3">
            <span className="text-[28px] font-bold leading-none tracking-[-0.02em] text-[#161613]">{panel.grade}</span>
            <span className="text-[14px] font-semibold text-[#161613]">{panel.positioning}</span>
            {panel.person_type !== 'job_seeker' && <span className="rounded-full bg-[#F5EEDD] px-2.5 py-0.5 text-[12px] font-semibold text-[#8A6A1F]">reads as a {panel.person_type}</span>}
          </div>
          <p className="mt-2 text-[13.5px] leading-relaxed text-[#161613]">{panel.summary}</p>
          {panel.highlights?.length > 0 && (
            <ul className="mt-2 space-y-1 text-[13.5px] text-[#161613]">
              {panel.highlights.map((h, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-[#9C9C95]">•</span>
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          )}
          {panel.logos?.filter(l => l.tier || l.source === 'model').length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {panel.logos
                .filter(l => l.tier || l.source === 'model')
                .map(l => (
                  <span key={`${l.kind}:${l.name}`} className={`rounded-md border px-2 py-0.5 text-[12px] font-semibold ${l.tier && ['S+', 'S'].includes(l.tier) ? 'border-[#1F3A2F] text-[#1F3A2F]' : 'border-[#D2D1C7] text-[#161613]'}`}>
                    {l.name}
                    {l.tier ? ` · ${tierWord(l.tier) ?? l.tier}` : ' · notable'}
                  </span>
                ))}
            </div>
          )}
          {panel.flags?.length > 0 && (
            <p className="mt-3 text-[12.5px] text-[#8A6A1F]">{panel.flags.map(f => `⚠ ${f}`).join('   ')}</p>
          )}

          <div className="mt-4 border-t border-[#E4E3DC] pt-4">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-[#9C9C95]">Live searches</p>
            {seats.length === 0 ? (
              <p className="mt-1 text-[13px] text-[#6E6E68]">No live seats today.</p>
            ) : shown.length === 0 ? (
              <p className="mt-1 text-[13px] text-[#6E6E68]">None strong or possible among the {seats.length} live seats.</p>
            ) : (
              <div className="mt-2 grid gap-2">
                {shown.map(f => {
                  const s = bySeat.get(f.job_id)!
                  return (
                    <div key={f.job_id} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-semibold text-[#161613]">
                          {s.companyName} · {s.headline || s.title}
                        </p>
                        <p className="text-[12.5px] text-[#6E6E68]">
                          {f.reason}
                          {isSuperAdmin && seatBand(s) ? ` · ${seatBand(s)}` : ''}
                          {f.blockers?.length ? ` · ⚠ ${f.blockers.join('; ')}` : ''}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[12px] font-bold ${f.fit === 'strong' ? 'bg-[#E7EDE9] text-[#1F3A2F]' : 'bg-[#F5EEDD] text-[#8A6A1F]'}`}>{f.fit}</span>
                    </div>
                  )
                })}
                {others > 0 && <p className="text-[12.5px] text-[#9C9C95]">{others} other seat{others === 1 ? '' : 's'}: no.</p>}
              </div>
            )}
          </div>

          {isSuperAdmin && panel.suggested_decision && ['uploaded', 'calibrating', 'decision_pending', 'ready_for_intro', 'bench', 'not_fit', 'dormant'].includes(journeyStage) && (
            <p className="mt-4 rounded-[12px] bg-[#E7EDE9] px-3.5 py-2.5 text-[13px] font-semibold text-[#1F3A2F]">
              Suggested: {panel.suggested_decision.replace(/_/g, ' ')}. <span className="font-normal">{panel.suggested_reason}</span>
            </p>
          )}
        </>
      )}

      {isSuperAdmin && <DeskDecisionButtons candidateId={candidateId} journeyStage={journeyStage} hasPanel={!!panel} />}
      {!isSuperAdmin && isOwner && journeyStage === 'intro_requested' && <PartnerIntroButtons candidateId={candidateId} />}

      <div className="mt-4 border-t border-[#E4E3DC] pt-4">
        <div className="flex items-baseline justify-between">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-[#9C9C95]">Where we are</p>
          <p className="text-[12.5px] text-[#6E6E68]">{stage.label}</p>
        </div>
        {next.length > 0 && <p className="mt-1 text-[12.5px] text-[#6E6E68]">Next: {next.join(' · ')}</p>}
        {timeline.length === 0 ? (
          <p className="mt-1 text-[13px] text-[#9C9C95]">Nothing sent yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-[#E4E3DC] text-[13px]">
            {timeline.slice(0, 12).map((t, i) => (
              <li key={i} className="grid grid-cols-[64px_1fr] gap-3 py-1.5">
                <span className="text-[11.5px] tabular-nums text-[#9C9C95]">{fmt(t.at)}</span>
                <span className={t.tone === 'warn' ? 'text-[#C2544B]' : 'text-[#161613]'}>{t.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
