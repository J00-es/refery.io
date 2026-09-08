import Link from 'next/link'
import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/server'
import { approvedPreviewForApplication } from '@/lib/onboarding/decisions'
import type { ScoutApplication } from '@/lib/intake'
import { resolveFee, payoutAmount, feeExplanation } from '@/lib/fees'

export const dynamic = 'force-dynamic'

/**
 * A personal invitation: one anonymised search, how it works in three lines,
 * and the door to an account with everything prefilled.
 *
 * Reached from an approval email (the application's invite token) or from
 * Lily's own outbound reply (a row in `invitations`). The client's name and
 * the full brief open only after the partner terms, so nothing here can
 * identify the client. A call with Lily is offered, never required.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const admin = createAdminClient()

  // Application token first (approval emails), then a personal invitation.
  const { data: app } = await admin
    .from('scout_applications')
    .select('*')
    .eq('invite_token', token)
    .in('status', ['approved', 'in_conversation', 'onboarded'])
    .maybeSingle()

  let fullName = app?.full_name ?? null
  let onboarded = app?.status === 'onboarded'
  let expired = false
  let preview: { title: string; summary: string; jobId: string; location: string | null; fee: ReturnType<typeof resolveFee> | null } | null = null
  let signupHref = app ? `/auth/sign-up?invite=${encodeURIComponent(token)}` : '/auth/sign-up'

  if (app) {
    const p = await approvedPreviewForApplication(admin, app as ScoutApplication)
    if (p) {
      const { data: role } = await admin.from('partner_roles_v').select('*').eq('job_id', p.jobId).maybeSingle()
      preview = { title: p.title, summary: p.summary, jobId: p.jobId, location: role?.location ?? null, fee: role ? resolveFee(role) : null }
    }
  } else {
    const hash = createHash('sha256').update(token).digest('hex')
    const { data: inv } = await admin.from('invitations').select('*').eq('token_hash', hash).maybeSingle()
    if (inv) {
      fullName = inv.full_name
      expired = Boolean(inv.revoked_at) || new Date(inv.expires_at as string).getTime() < Date.now()
      onboarded = Boolean(inv.used_at)
      if (!inv.opened_at) await admin.from('invitations').update({ opened_at: new Date().toISOString() }).eq('id', inv.id)
      if (inv.job_id) {
        const [{ data: role }, { data: pr }] = await Promise.all([
          admin.from('partner_roles_v').select('*').eq('job_id', inv.job_id).maybeSingle(),
          admin.from('partner_roles').select('preview_summary, preview_approved').eq('job_id', inv.job_id).maybeSingle(),
        ])
        if (role && pr?.preview_approved && pr.preview_summary) {
          preview = { title: role.headline || role.title, summary: pr.preview_summary, jobId: role.job_id, location: role.location, fee: resolveFee(role) }
        }
      }
      signupHref = `/auth/sign-up?invite=${encodeURIComponent(token)}`
    } else {
      expired = true
    }
  }

  const first = (fullName ?? '').split(/\s+/)[0] || null

  return (
    <div className="min-h-svh bg-[#F2F1EB] text-[#161613]">
      <div className="mx-auto w-full max-w-md px-5 pb-12 pt-10 sm:pt-14">
        <p className="text-[18px] font-semibold">Refery<span className="text-[#1F3A2F]">.</span></p>

        {expired ? (
          <section className="mt-8">
            <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.02em]">This invitation has lapsed</h1>
            <p className="mt-2 text-[14px] text-[#6E6E68]">Reply to Lily&rsquo;s message and she will send a new one. If you already have an account, <Link href="/auth/login" className="font-semibold text-[#1F3A2F] underline underline-offset-2">log in</Link>.</p>
          </section>
        ) : onboarded ? (
          <section className="mt-8">
            <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.02em]">You already have an account{first ? `, ${first}` : ''}</h1>
            <p className="mt-2 text-[14px] text-[#6E6E68]">Everything is inside it, including the search below.</p>
            <Link href="/auth/login" className="mt-5 inline-flex min-h-[48px] w-full items-center justify-center rounded-full bg-[#1F3A2F] text-[14px] font-semibold text-white">Log in</Link>
          </section>
        ) : (
          <>
            <section className="mt-8">
              <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.02em]">{first ? `Lily invited you, ${first}.` : 'An invitation from Lily.'}</h1>
              <p className="mt-2 text-[14px] text-[#6E6E68]">{preview ? 'Here is the search she had in mind, in a little more detail, and what happens if you say yes.' : 'Here is how it works, and how to set up your account in about four minutes.'}</p>
            </section>

            {preview && (
              <section className="mt-5 rounded-[14px] border border-[#E4E3DC] bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[16px] font-semibold leading-tight">{preview.title}</p>
                    {preview.location && <p className="mt-0.5 text-[12.5px] text-[#9C9C95]">{preview.location}</p>}
                  </div>
                </div>
                <p className="mt-3 text-[13px] text-[#2A2A26]">{preview.summary}</p>
                {preview.fee && (
                  <p className="mt-3 text-[12.5px]">
                    <span className="font-semibold text-[#1F3A2F]">{payoutAmount(preview.fee) ? `${payoutAmount(preview.fee)} to you on a placement` : `${preview.fee.scoutSharePercentage}% of the fee to you`}</span>
                    <span className="text-[#9C9C95]"> · {feeExplanation(preview.fee)}</span>
                  </p>
                )}
                <p className="mt-3 text-[12px] text-[#9C9C95]">The company&rsquo;s name and the full brief open after the partner terms. Every client has a confidentiality agreement with us.</p>
              </section>
            )}

            <section className="mt-4 rounded-[14px] border border-[#E4E3DC] bg-white p-4">
              <p className="text-[13px] font-semibold">How it works</p>
              <dl className="mt-2 grid gap-1.5 text-[12.5px] text-[#2A2A26]">
                <div className="flex gap-3"><dt className="w-11 shrink-0 font-semibold">You</dt><dd>Ask a person you&rsquo;d vouch for, then send their CV as a PDF with a few lines on why.</dd></div>
                <div className="flex gap-3"><dt className="w-11 shrink-0 font-semibold">Refery</dt><dd>Reads them within two working days, talks to them, runs the process with the startup.</dd></div>
                <div className="flex gap-3"><dt className="w-11 shrink-0 font-semibold">Paid</dt><dd>70% of the fee once they&rsquo;ve passed 90 days and the client has paid. Nothing upfront on either side.</dd></div>
              </dl>
              <p className="mt-2 text-[12.5px] text-[#6E6E68]">No minimum volume, no hours, no exclusivity. <Link href="/partner-terms" className="font-semibold text-[#1F3A2F] underline underline-offset-2">The full terms</Link></p>
            </section>

            <Link href={signupHref} className="mt-5 inline-flex min-h-[48px] w-full items-center justify-center rounded-full bg-[#1F3A2F] text-[14px] font-semibold text-white">Create my account</Link>
            <p className="mt-2 text-center text-[12px] text-[#9C9C95]">Three steps, about four minutes. Your name and email are already filled in.</p>

            <section className="mt-6 flex items-center justify-between gap-3 rounded-[14px] border border-[#E4E3DC] bg-[#FAF9F5] px-4 py-3">
              <div>
                <p className="text-[13px] font-semibold">Prefer to talk it through first?</p>
                <p className="text-[12.5px] text-[#6E6E68]">Lily does 15-minute calls. Optional.</p>
              </div>
              <a href="https://cal.com/refery-lily/15" target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-full border border-[#D2D1C7] px-3 py-2 text-[12.5px] font-semibold">Book</a>
            </section>
            <p className="mt-3 text-center text-[12.5px] text-[#6E6E68]">Not for you, or a quick question? Reply to Lily&rsquo;s message. No form needed.</p>
          </>
        )}
      </div>
    </div>
  )
}
