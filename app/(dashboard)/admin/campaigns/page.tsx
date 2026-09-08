'use client'

import { useCallback, useEffect, useState } from 'react'
import { Spinner } from '@/components/ui/spinner'

/**
 * Outbound links: the universal link behind a mass LinkedIn DM or a cold email.
 *
 * Four things on one page: what the general link shows today, the links that
 * exist and how they are doing, a form to make one, and the anonymised
 * preview on every live search. A general link shows the two most urgent
 * live searches (one engineering, one GTM) by rule, so one link serves all
 * outreach. Approving a preview here is what lets the page and the recruiter
 * email show the one-clause summary; the title and facts show regardless.
 */

interface Campaign {
  id: string
  slug: string
  name: string
  kind: 'general' | 'search'
  channel: string
  sender_name: string
  job_id: string | null
  summary: string
  active_to: string | null
  created_at: string
  audience: number
  matched: number
  unmatched: number
  joined: number
  link: string
}
interface Role {
  job_id: string
  title: string
  headline: string | null
  company_name: string | null
  department: string | null
  location: string | null
  priority: string
  search_stage: string
  live_submission_count: number
  fn: 'engineering' | 'gtm' | null
  public_title: string
  preview_summary: string | null
  preview_approved: boolean
  pinned: boolean
  featured: 'engineering' | 'gtm' | null
}
interface Featured {
  jobId: string
  title: string
  facts: string
  summary: string | null
  companyName: string | null
}
interface Data {
  campaigns: Campaign[]
  roles: Role[]
  featured: { engineering: Featured | null; gtm: Featured | null }
}

const INPUT = 'h-11 rounded-md border border-[#D2D1C7] bg-white px-3'
const FN_LABEL = { engineering: 'Engineering', gtm: 'Sales & GTM' } as const

export default function CampaignsPage() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ kind: 'general' as 'general' | 'search', name: '', slug: '', job_id: '', sender_name: 'Marj', channel: 'linkedin', summary: '', audience: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [more, setMore] = useState<Record<string, string>>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const load = useCallback(() => {
    fetch('/api/admin/campaigns')
      .then(async r => (r.ok ? r.json() : Promise.reject(new Error((await r.json().catch(() => ({}))).error ?? 'Could not load'))))
      .then((d: Data) => {
        setData(d)
        setDrafts(Object.fromEntries(d.roles.map(r => [r.job_id, r.preview_summary ?? ''])))
      })
      .catch(e => setError(e.message))
  }, [])
  useEffect(load, [load])

  function pickRole(jobId: string) {
    const r = data?.roles.find(x => x.job_id === jobId)
    setForm(f => ({
      ...f,
      job_id: jobId,
      summary: f.summary || r?.preview_summary || '',
      slug: f.slug || (r ? `${(r.location ?? 'us').split(/[,/(]/)[0].trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${r.public_title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}`.replace(/-+$/, '') : ''),
      name: f.name || (r ? `${r.public_title} · ${r.location ?? ''}`.trim() : ''),
    }))
  }

  async function create() {
    setBusy(true)
    setMsg(null)
    const res = await fetch('/api/admin/campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    const body = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) {
      setMsg(body.error ?? 'Could not create')
      return
    }
    setMsg(`Created. ${body.audienceAdded} people in the audience.`)
    setForm({ kind: 'general', name: '', slug: '', job_id: '', sender_name: 'Marj', channel: 'linkedin', summary: '', audience: '' })
    load()
  }

  async function addMore(slug: string) {
    const text = more[slug] ?? ''
    if (!text.trim()) return
    const res = await fetch('/api/admin/campaigns', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, audience: text }) })
    const body = await res.json().catch(() => ({}))
    setMsg(res.ok ? `Added ${body.audienceAdded} to ${slug}.` : body.error ?? 'Could not add')
    setMore(m => ({ ...m, [slug]: '' }))
    load()
  }

  async function patchPreview(jobId: string, patch: { summary?: string; approved?: boolean; pinned?: boolean }, done: string) {
    setBusy(true)
    const res = await fetch('/api/admin/campaigns', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ job_id: jobId, ...patch }) })
    const body = await res.json().catch(() => ({}))
    setBusy(false)
    setMsg(res.ok ? done : body.error ?? 'Could not save')
    load()
  }

  if (error) return <div className="mx-auto max-w-3xl px-4 py-16 text-sm text-[#8A3B2A]">{error}</div>
  if (!data) return <div className="flex justify-center py-24"><Spinner /></div>

  const general = data.campaigns.find(c => c.kind === 'general')

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Outbound links</h1>
        <p className="mt-2 max-w-xl text-sm text-[#6E6E68]">
          One link for all outreach. The page shows the two searches that need people most right now, one engineering and one GTM, anonymised, and asks who they are. People on a link&rsquo;s list go straight to an account; everyone else lands with you in Slack.
        </p>
        {msg && <p className="mt-4 rounded-lg bg-[#E7EDE9] px-4 py-2.5 text-sm text-[#1F3A2F]">{msg}</p>}
      </header>

      <section className="mb-10 rounded-[16px] border border-[#E4E3DC] bg-white p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">What the general link shows today</h2>
          {general && <span className="break-all font-mono text-[13px] text-[#1F3A2F]">{general.link}</span>}
        </div>
        <p className="mt-1 text-xs text-[#9C9C95]">By rule: the pinned search for the function, else the highest priority, then the fewest live submissions, then the one open longest. Only searches still sourcing count. Re-chosen every time the page loads.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(['engineering', 'gtm'] as const).map(fn => {
            const f = data.featured[fn]
            return (
              <div key={fn} className="rounded-[12px] border border-[#E4E3DC] bg-[#FAF9F5] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5E8571]">{FN_LABEL[fn]}</p>
                {f ? (
                  <>
                    <p className="mt-1 text-[15px] font-semibold leading-tight">{f.title}</p>
                    {f.facts && <p className="mt-0.5 text-[12.5px] text-[#9C9C95]">{f.facts}</p>}
                    <p className="mt-2 text-[13px] text-[#2A2A26]">{f.summary ?? <span className="text-[#A3423A]">No approved summary. The page shows the title, facts and fee only.</span>}</p>
                    <p className="mt-2 text-[11.5px] text-[#9C9C95]">Internal: {f.companyName}</p>
                  </>
                ) : (
                  <p className="mt-1 text-[13px] text-[#6E6E68]">No live {FN_LABEL[fn].toLowerCase()} search is sourcing. The page shows the other card only.</p>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <section className="mb-10 rounded-[16px] border border-[#E4E3DC] bg-white p-5">
        <h2 className="text-base font-semibold">New link</h2>
        <div className="mt-4 grid gap-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {(['general', 'search'] as const).map(k => (
              <label key={k} className={`flex cursor-pointer gap-3 rounded-[12px] border p-3 text-sm ${form.kind === k ? 'border-[#1F3A2F] bg-[#E7EDE9]' : 'border-[#D2D1C7]'}`}>
                <input type="radio" name="kind" checked={form.kind === k} onChange={() => setForm({ ...form, kind: k })} className="mt-1" />
                <span>
                  <span className="block font-semibold">{k === 'general' ? 'General' : 'One search'}</span>
                  <span className="block text-xs text-[#6E6E68]">{k === 'general' ? 'Shows the two most urgent live searches, re-chosen on every load. For any DM or email.' : 'Shows one search you pick, with the summary you write here. For an audience built around it.'}</span>
                </span>
              </label>
            ))}
          </div>
          {form.kind === 'search' && (
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Search</span>
              <select value={form.job_id} onChange={e => pickRole(e.target.value)} className={INPUT}>
                <option value="">Pick a live search</option>
                {data.roles.map(r => (
                  <option key={r.job_id} value={r.job_id}>
                    {r.public_title} · {r.company_name} · {r.location ?? ''}{r.priority === 'urgent' ? ' · urgent' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm"><span className="font-medium">Name (internal)</span><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder={form.kind === 'general' ? 'LinkedIn outreach · September' : ''} className={INPUT} /></label>
            <label className="grid gap-1 text-sm"><span className="font-medium">Slug</span><input value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} placeholder={form.kind === 'general' ? 'join' : 'sf-engineering'} className={`${INPUT} font-mono`} /></label>
            <label className="grid gap-1 text-sm"><span className="font-medium">Sender</span><input value={form.sender_name} onChange={e => setForm({ ...form, sender_name: e.target.value })} className={INPUT} /></label>
            <label className="grid gap-1 text-sm"><span className="font-medium">Channel</span><select value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })} className={INPUT}><option value="linkedin">LinkedIn DM</option><option value="email">Email</option><option value="other">Other</option></select></label>
          </div>
          {form.kind === 'search' && (
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Anonymised summary, shown on the page and approved by saving</span>
              <textarea value={form.summary} onChange={e => setForm({ ...form, summary: e.target.value })} rows={4} className="rounded-md border border-[#D2D1C7] px-3 py-2" placeholder="An early-stage company in the SF Bay Area making its first engineering hires, on-site, across applied AI, full-stack and forward-deployed engineering. Hands-on people with 1 to 5 years who have shipped at a startup." />
              <span className="text-xs text-[#9C9C95]">Allowed: stage band, city, on-site or remote, function, one clause on what they build, base range, fee. Not allowed: name, funding amount, investors, customers, launch dates, founder background.</span>
            </label>
          )}
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Audience, one per line: name, LinkedIn URL, optional email. Optional.</span>
            <textarea value={form.audience} onChange={e => setForm({ ...form, audience: e.target.value })} rows={4} className="rounded-md border border-[#D2D1C7] px-3 py-2 font-mono text-xs" placeholder={'Rishi Agrawal, https://www.linkedin.com/in/rishi-agrawal\nJane Doe, https://linkedin.com/in/janedoe, jane@example.com'} />
            <span className="text-xs text-[#9C9C95]">People on the list skip the application. A general link with no list still works: everyone who opens it becomes an application for you to read.</span>
          </label>
          <button type="button" disabled={busy} onClick={create} className="min-h-[44px] rounded-full bg-[#1F3A2F] px-5 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? 'Working' : 'Create link'}
          </button>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-base font-semibold">Links</h2>
        {data.campaigns.length === 0 && <p className="text-sm text-[#6E6E68]">None yet.</p>}
        <ul className="grid gap-4">
          {data.campaigns.map(c => (
            <li key={c.id} className="rounded-[16px] border border-[#E4E3DC] bg-white p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-[15px] font-semibold">{c.name} <span className="ml-1 rounded-full bg-[#FAF9F5] px-2 py-0.5 text-[11px] font-medium text-[#6E6E68]">{c.kind === 'general' ? 'general' : 'one search'}</span></h3>
                <span className="text-xs text-[#9C9C95]">{c.channel} · {c.sender_name}{c.active_to ? ` · closes ${c.active_to.slice(0, 10)}` : ''}</span>
              </div>
              <p className="mt-1 break-all font-mono text-[13px] text-[#1F3A2F]">{c.link}</p>
              <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
                {[['Audience', c.audience], ['Matched', c.matched], ['Joined', c.joined], ['Not on list', c.unmatched]].map(([l, v]) => (
                  <div key={String(l)} className="rounded-lg bg-[#FAF9F5] px-2 py-2"><dd className="font-mono text-lg font-medium">{v}</dd><dt className="text-[11px] text-[#6E6E68]">{l}</dt></div>
                ))}
              </dl>
              <p className="mt-3 text-[13px] text-[#2A2A26]">{c.kind === 'general' ? 'Shows the two featured searches above, re-chosen on every load.' : c.summary}</p>
              <div className="mt-3 grid gap-2">
                <textarea value={more[c.slug] ?? ''} onChange={e => setMore(m => ({ ...m, [c.slug]: e.target.value }))} rows={2} placeholder="Add people: name, LinkedIn URL per line" className="rounded-md border border-[#D2D1C7] px-3 py-2 font-mono text-xs" />
                <button type="button" onClick={() => addMore(c.slug)} className="min-h-[40px] w-fit rounded-full border border-[#D2D1C7] px-4 text-sm font-semibold">Add to audience</button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-base font-semibold">Anonymised previews</h2>
        <p className="mt-1 max-w-xl text-sm text-[#6E6E68]">One per live search. Approving lets the general link, a search link and the recruiter email show the summary before the partner terms. The server refuses words that name the client. Pin a search to put it first on the general link for its function.</p>
        <ul className="mt-4 grid gap-3">
          {data.roles
            .slice()
            .sort((a, b) => (a.fn ?? 'z').localeCompare(b.fn ?? 'z') || (a.featured ? -1 : b.featured ? 1 : 0) || a.public_title.localeCompare(b.public_title))
            .map(r => (
              <li key={r.job_id} className="rounded-[16px] border border-[#E4E3DC] bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[14px] font-semibold">
                      {r.public_title}
                      {r.featured && <span className="ml-2 rounded-full bg-[#E7EDE9] px-2 py-0.5 text-[11px] font-semibold text-[#1F3A2F]">on the general link</span>}
                      {r.pinned && <span className="ml-1 rounded-full bg-[#F5EEDD] px-2 py-0.5 text-[11px] font-semibold text-[#8A6A1F]">pinned</span>}
                    </p>
                    <p className="text-[12px] text-[#9C9C95]">{r.fn ? FN_LABEL[r.fn] : 'Neither engineering nor GTM'} · {r.company_name} · {r.location ?? ''} · {r.priority}{r.search_stage !== 'sourcing' ? ` · ${r.search_stage.replace('_', ' ')}` : ''}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.preview_approved ? 'bg-[#E7EDE9] text-[#1F3A2F]' : 'bg-[#FAF9F5] text-[#6E6E68]'}`}>{r.preview_approved ? 'approved' : r.preview_summary ? 'draft' : 'no summary'}</span>
                </div>
                <textarea value={drafts[r.job_id] ?? ''} onChange={e => setDrafts(d => ({ ...d, [r.job_id]: e.target.value }))} rows={3} className="mt-3 w-full rounded-md border border-[#D2D1C7] px-3 py-2 text-[13px]" placeholder="Stage band, city, on-site or remote, one clause on what they build, who fits. Nothing that identifies them." />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" disabled={busy} onClick={() => patchPreview(r.job_id, { summary: drafts[r.job_id] ?? '' }, 'Saved.')} className="min-h-[36px] rounded-full border border-[#D2D1C7] px-3 text-[12.5px] font-semibold">Save</button>
                  {r.preview_approved ? (
                    <button type="button" disabled={busy} onClick={() => patchPreview(r.job_id, { approved: false }, 'Approval withdrawn.')} className="min-h-[36px] rounded-full border border-[#D2D1C7] px-3 text-[12.5px] font-semibold">Withdraw approval</button>
                  ) : (
                    <button type="button" disabled={busy} onClick={() => patchPreview(r.job_id, { summary: drafts[r.job_id] ?? '', approved: true }, 'Approved. The page shows it now.')} className="min-h-[36px] rounded-full bg-[#1F3A2F] px-3 text-[12.5px] font-semibold text-white">Save and approve</button>
                  )}
                  {r.fn && (
                    <button type="button" disabled={busy} onClick={() => patchPreview(r.job_id, { pinned: !r.pinned }, r.pinned ? 'Unpinned. The rule chooses again.' : `Pinned as the ${FN_LABEL[r.fn as 'engineering' | 'gtm'].toLowerCase()} search on the general link.`)} className="min-h-[36px] rounded-full border border-[#D2D1C7] px-3 text-[12.5px] font-semibold">{r.pinned ? 'Unpin' : 'Pin to general link'}</button>
                  )}
                </div>
              </li>
            ))}
        </ul>
      </section>
    </div>
  )
}
