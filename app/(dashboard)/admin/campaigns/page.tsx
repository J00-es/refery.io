'use client'

import { useCallback, useEffect, useState } from 'react'
import { Spinner } from '@/components/ui/spinner'

/**
 * Outbound campaigns: the universal link behind a mass LinkedIn DM.
 *
 * Three things on one page: the links that exist and how they are doing, a
 * form to make one, and a box to paste more people into an audience. The
 * summary written here is the anonymised preview the page shows, so writing
 * it is also approving it.
 */

interface Campaign {
  id: string
  slug: string
  name: string
  channel: string
  sender_name: string
  job_id: string
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
  location: string | null
  priority: string
}
interface Preview {
  job_id: string
  preview_summary: string | null
  preview_approved: boolean
}

export default function CampaignsPage() {
  const [data, setData] = useState<{ campaigns: Campaign[]; roles: Role[]; previews: Preview[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', slug: '', job_id: '', sender_name: 'Marj', channel: 'linkedin', summary: '', audience: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [more, setMore] = useState<Record<string, string>>({})

  const load = useCallback(() => {
    fetch('/api/admin/campaigns')
      .then(async r => (r.ok ? r.json() : Promise.reject(new Error((await r.json().catch(() => ({}))).error ?? 'Could not load'))))
      .then(setData)
      .catch(e => setError(e.message))
  }, [])
  useEffect(load, [load])

  function pickRole(jobId: string) {
    const p = data?.previews.find(x => x.job_id === jobId)
    const r = data?.roles.find(x => x.job_id === jobId)
    setForm(f => ({
      ...f,
      job_id: jobId,
      summary: f.summary || p?.preview_summary || '',
      slug: f.slug || (r ? `${(r.location ?? 'us').split(/[,/]/)[0].trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${(r.headline || r.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}` : ''),
      name: f.name || (r ? `${r.headline || r.title} · ${r.location ?? ''}`.trim() : ''),
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
    setForm({ name: '', slug: '', job_id: '', sender_name: 'Marj', channel: 'linkedin', summary: '', audience: '' })
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

  if (error) return <div className="mx-auto max-w-3xl px-4 py-16 text-sm text-[#8A3B2A]">{error}</div>
  if (!data) return <div className="flex justify-center py-24"><Spinner /></div>

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Outbound links</h1>
        <p className="mt-2 max-w-xl text-sm text-[#6E6E68]">
          One link per audience for the mass DMs. The page asks who they are; people on the list go straight to an account, everyone else lands with you in Slack.
        </p>
        {msg && <p className="mt-4 rounded-lg bg-[#E7EDE9] px-4 py-2.5 text-sm text-[#1F3A2F]">{msg}</p>}
      </header>

      <section className="mb-10 rounded-[16px] border border-[#E4E3DC] bg-white p-5">
        <h2 className="text-base font-semibold">New link</h2>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Search</span>
            <select value={form.job_id} onChange={e => pickRole(e.target.value)} className="h-11 rounded-md border border-[#D2D1C7] bg-white px-3">
              <option value="">Pick a live search</option>
              {data.roles.map(r => (
                <option key={r.job_id} value={r.job_id}>
                  {r.headline || r.title} · {r.company_name} · {r.location ?? ''}{r.priority === 'urgent' ? ' · urgent' : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm"><span className="font-medium">Name (internal)</span><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="h-11 rounded-md border border-[#D2D1C7] px-3" /></label>
            <label className="grid gap-1 text-sm"><span className="font-medium">Slug</span><input value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} placeholder="sf-engineering" className="h-11 rounded-md border border-[#D2D1C7] px-3 font-mono" /></label>
            <label className="grid gap-1 text-sm"><span className="font-medium">Sender</span><input value={form.sender_name} onChange={e => setForm({ ...form, sender_name: e.target.value })} className="h-11 rounded-md border border-[#D2D1C7] px-3" /></label>
            <label className="grid gap-1 text-sm"><span className="font-medium">Channel</span><select value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })} className="h-11 rounded-md border border-[#D2D1C7] bg-white px-3"><option value="linkedin">LinkedIn DM</option><option value="email">Email</option><option value="other">Other</option></select></label>
          </div>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Anonymised summary, shown on the page and approved by saving</span>
            <textarea value={form.summary} onChange={e => setForm({ ...form, summary: e.target.value })} rows={4} className="rounded-md border border-[#D2D1C7] px-3 py-2" placeholder="An early-stage company in the SF Bay Area making its first engineering hires, on-site, across applied AI, full-stack and forward-deployed engineering. Hands-on people with 1 to 5 years who have shipped at a startup." />
            <span className="text-xs text-[#9C9C95]">Allowed: stage band, city, on-site or remote, function, one clause on what they build, base range, fee. Not allowed: name, funding amount, investors, customers, launch dates, founder background.</span>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Audience, one per line: name, LinkedIn URL, optional email</span>
            <textarea value={form.audience} onChange={e => setForm({ ...form, audience: e.target.value })} rows={5} className="rounded-md border border-[#D2D1C7] px-3 py-2 font-mono text-xs" placeholder={'Rishi Agrawal, https://www.linkedin.com/in/rishi-agrawal\nJane Doe, https://linkedin.com/in/janedoe, jane@example.com'} />
          </label>
          <button type="button" disabled={busy} onClick={create} className="min-h-[44px] rounded-full bg-[#1F3A2F] px-5 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? 'Creating' : 'Create link'}
          </button>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">Links</h2>
        {data.campaigns.length === 0 && <p className="text-sm text-[#6E6E68]">None yet.</p>}
        <ul className="grid gap-4">
          {data.campaigns.map(c => (
            <li key={c.id} className="rounded-[16px] border border-[#E4E3DC] bg-white p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-[15px] font-semibold">{c.name}</h3>
                <span className="text-xs text-[#9C9C95]">{c.channel} · {c.sender_name}{c.active_to ? ` · closes ${c.active_to.slice(0, 10)}` : ''}</span>
              </div>
              <p className="mt-1 break-all font-mono text-[13px] text-[#1F3A2F]">{c.link}</p>
              <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
                {[['Audience', c.audience], ['Matched', c.matched], ['Joined', c.joined], ['Not on list', c.unmatched]].map(([l, v]) => (
                  <div key={String(l)} className="rounded-lg bg-[#FAF9F5] px-2 py-2"><dd className="font-mono text-lg font-medium">{v}</dd><dt className="text-[11px] text-[#6E6E68]">{l}</dt></div>
                ))}
              </dl>
              <p className="mt-3 text-[13px] text-[#2A2A26]">{c.summary}</p>
              <div className="mt-3 grid gap-2">
                <textarea value={more[c.slug] ?? ''} onChange={e => setMore(m => ({ ...m, [c.slug]: e.target.value }))} rows={2} placeholder="Add people: name, LinkedIn URL per line" className="rounded-md border border-[#D2D1C7] px-3 py-2 font-mono text-xs" />
                <button type="button" onClick={() => addMore(c.slug)} className="min-h-[40px] w-fit rounded-full border border-[#D2D1C7] px-4 text-sm font-semibold">Add to audience</button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
