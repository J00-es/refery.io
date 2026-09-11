import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { CARD, CHIP, CHIP_BAD, CHIP_VALUE, CHIP_WARN, FIGURE, H1, H2, LABEL, LEDE, META } from '@/lib/desk-ui'
import { ensureDeskMailbox } from '@/lib/sourcing/mailboxes'
import { loadCapacity, requireSourcingUser } from '@/lib/sourcing/page-data'
import { AddMailboxForm, MailboxRowActions } from '@/components/sourcing/mailbox-forms'
import { SuppressForm } from '@/components/sourcing/actions'

export const dynamic = 'force-dynamic'

const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never')
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '–')

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function MailboxesPage({ searchParams }: PageProps) {
  await requireSourcingUser()
  const sp = await searchParams
  const google = (Array.isArray(sp.google) ? sp.google[0] : sp.google) ?? ''
  const msg = (Array.isArray(sp.msg) ? sp.msg[0] : sp.msg) ?? ''
  const admin = createAdminClient()
  await ensureDeskMailbox(admin)
  const { health, forecast } = await loadCapacity(admin)
  const { data: suppressions } = await admin.from('sourcing_suppressions').select('email, reason, created_at').order('created_at', { ascending: false }).limit(50)
  const saConfigured = Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)

  return (
    <div className="mx-auto max-w-[1120px] space-y-7 px-1 pb-16 sm:px-0">
      <div className={`flex items-center gap-1.5 ${META}`}>
        <Link href="/sourcing" className="hover:text-[#161613]">
          Sourcing
        </Link>
        <span>/</span>
        <span className="text-[#161613]">Mailboxes</span>
      </div>
      {google && msg && (
        <p className={`${CARD} px-5 py-3 text-[13.5px] ${google === 'connected' ? 'text-[#1F3A2F]' : 'text-[#9C3F37]'}`}>{msg}</p>
      )}
      <header>
        <h1 className={H1}>Mailboxes</h1>
        <p className={`mt-2 max-w-2xl ${LEDE}`}>Real Google Workspace mailboxes, sending through Gmail itself. Every message sits in that person&apos;s Sent folder and every reply in their inbox. A mailbox whose reply sync fails or goes stale stops sending on its own.</p>
        <p className={`mt-2 ${META}`}>
          Today&apos;s room: {health.reduce((s, h) => s + (h.mailbox.status === 'active' ? h.room : 0), 0)} sends · a month at two steps: about {forecast.peoplePerMonth} people ({forecast.sendsPerMonth} sends, {forecast.firstEmailsPerMonth} first emails on three days a week)
        </p>
      </header>

      <div className="space-y-2.5">
        {health.map(h => {
          const m = h.mailbox
          return (
            <div key={m.id} className={`${CARD} p-5`}>
              <div className="grid gap-4 lg:grid-cols-[260px_repeat(3,110px)_minmax(0,1fr)] lg:items-start">
                <div>
                  <div className="text-[15px] font-semibold text-[#161613]">{m.address}</div>
                  <div className={META}>
                    {m.display_name} · signs as {m.signs_as} · {m.credential.kind === 'desk' ? 'desk token' : m.credential.kind === 'service_account' ? 'delegated' : 'refresh token'}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {m.status === 'paused' ? <span className={CHIP}>paused</span> : h.blocked ? <span className={CHIP_WARN}>{h.blocked}</span> : <span className={CHIP_VALUE}>sending</span>}
                    {m.ramp_started_at && h.cap < m.cap_ceiling && <span className={CHIP}>ramping · {h.cap} a day</span>}
                    {m.last_sync_ok === false && <span className={CHIP_BAD}>sync failed</span>}
                  </div>
                </div>
                <div>
                  <div className={FIGURE}>{h.sent}</div>
                  <div className={`mt-1 ${LABEL}`}>sent today of {h.cap}{m.reserved_other ? ` (${m.reserved_other} kept for other mail)` : ''}</div>
                </div>
                <div>
                  <div className={FIGURE}>{pct(h.replied30, h.sent30)}</div>
                  <div className={`mt-1 ${LABEL}`}>replied, 30 days ({h.replied30} of {h.sent30})</div>
                </div>
                <div>
                  <div className={FIGURE}>{pct(h.bounced30, h.sent30)}</div>
                  <div className={`mt-1 ${LABEL}`}>bounced, 30 days</div>
                </div>
                <div className={`${META} leading-relaxed`}>
                  Replies last read {when(m.last_sync_at)}.{m.last_error ? ` Last error: ${m.last_error}` : ''}
                  <div className="mt-2">
                    <MailboxRowActions m={m} />
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className={`${CARD} p-5`}>
          <h2 className={H2}>Add a mailbox</h2>
          <p className={`mt-1.5 ${LEDE}`}>The easy way: sign in with Google as the mailbox. Google asks once for permission to send and to read replies, the token is kept on the mailbox row, and the address appears above ready to test.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <a href="/api/admin/google/connect?mailbox=1" className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-[#1F3A2F] px-5 text-[14px] font-semibold text-white hover:bg-[#142E24]">
              Connect a Google mailbox
            </a>
            <span className={META}>Pick the account on Google&apos;s screen; to add Kim&apos;s, do it in a window signed in to Google as Kim.</span>
          </div>
          <details className="mt-5">
            <summary className="cursor-pointer text-[13px] font-semibold text-[#1F3A2F]">Or add one by hand (delegation or a pasted token)</summary>
            <p className={`mt-2 mb-4 ${META}`}>
              {saConfigured ? 'Domain-wide delegation is configured; any address in a delegated Workspace works at once.' : 'GOOGLE_SERVICE_ACCOUNT_JSON is not set, so delegation cannot mint tokens yet.'}
            </p>
            <AddMailboxForm />
          </details>
        </div>
        <div className="space-y-5">
          <div className={`${CARD} p-5`}>
            <h2 className={H2}>Sending rules</h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-[#2A2A26]">
              <li>A new mailbox starts at its cap and gains five every weekday to the ceiling. Google allows 2,000; the desk never goes near it.</li>
              <li>First emails only on the sequence&apos;s send days and morning window; follow-ups on weekdays in working hours; three per mailbox every ten minutes.</li>
              <li>Bounce rate over 3% in 30 days pauses the mailbox. A failed or stale reply sync pauses it too.</li>
              <li>Every reply stops the person&apos;s sequence, including one Lily sends by hand from Gmail. A &ldquo;no&rdquo; is honoured with silence.</li>
              <li>No warm-up network, no tracking pixels, no rewritten links.</li>
            </ul>
          </div>
          <div className={`${CARD} p-5`}>
            <h2 className={H2}>Never list</h2>
            <p className={`mt-1.5 mb-3 ${META}`}>Addresses no search will ever write to. Replies that ask for it land here on their own.</p>
            <SuppressForm />
            <ul className="mt-3 space-y-1 text-[12.5px] text-[#6E6E68]">
              {(suppressions ?? []).map(s => (
                <li key={s.email}>
                  <span className="text-[#161613]">{s.email}</span> · {s.reason} · {when(s.created_at)}
                </li>
              ))}
              {!suppressions?.length && <li>Empty.</li>}
            </ul>
          </div>
        </div>
      </section>
    </div>
  )
}
