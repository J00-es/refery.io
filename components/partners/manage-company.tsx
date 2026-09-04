'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Check, ChevronRight, Loader2, Settings2, Upload } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { FIELD_LABEL, FOCUS } from '@/lib/desk-ui'
import { formatSalary } from '@/lib/job-ui'

/**
 * The super admin's control panel for one client, in a sheet rather than its own
 * console.
 *
 * Setting a client up is four decisions — who the network may know about, which
 * of their roles are ours, who is briefed, and what the brief says — and all
 * four are made while looking at the client. A separate admin area would mean
 * navigating away from the thing being configured and back again to check.
 *
 * The sheet is full-height and single-column, so it works on a phone: this gets
 * used in the ten minutes after an intake call, not at a desk.
 */

type Tab = 'roles' | 'access' | 'brief' | 'visibility'

interface JobOption {
  id: string
  title: string
  department: string | null
  location: string | null
  status: string
  salary_min: number | null
  salary_max: number | null
  is_mandate: boolean
}

interface UserOption {
  user_id: string
  email: string
  full_name: string | null
  role: string
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'roles', label: 'Mandate roles' },
  { key: 'access', label: 'Assign scouts' },
  { key: 'brief', label: 'Scout brief' },
  { key: 'visibility', label: 'Visibility' },
]

const label = FIELD_LABEL
const input = `mt-1.5 w-full rounded-[12px] border border-[#E4E3DC] bg-white px-3 py-2.5 text-[14px] text-[#161613] placeholder:text-[#B8B8B0] ${FOCUS}`
const primary = `inline-flex min-h-[42px] items-center justify-center gap-2 rounded-full bg-[#1F3A2F] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-[#142E24] disabled:opacity-60 ${FOCUS}`

export function ManageCompany({
  companyId,
  companyName,
  initial,
  assignedUserIds,
  hasBrief,
  briefId,
  briefStatus,
  liveRoles,
}: {
  companyId: string
  companyName: string
  initial: {
    isPublished: boolean
    isActive: boolean
    anonAlias: string | null
    publicBlurb: string | null
  }
  assignedUserIds: string[]
  hasBrief: boolean
  briefId: string | null
  briefStatus: string | null
  liveRoles: number
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('roles')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)

  // visibility
  const [isPublished, setIsPublished] = useState(initial.isPublished)
  const [alias, setAlias] = useState(initial.anonAlias ?? '')
  const [blurb, setBlurb] = useState(initial.publicBlurb ?? '')

  // roles
  const [jobs, setJobs] = useState<JobOption[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())

  // access
  const [users, setUsers] = useState<UserOption[] | null>(null)
  const [assignees, setAssignees] = useState<Set<string>>(new Set(assignedUserIds))

  // brief
  const [html, setHtml] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [publishBrief, setPublishBrief] = useState(true)

  useEffect(() => {
    if (!open) return
    if (tab === 'roles' && jobs === null) {
      fetch(`/api/partners/companies/${companyId}/jobs`)
        .then(r => r.json())
        .then(body => {
          const list: JobOption[] = body.jobs ?? []
          setJobs(list)
          setPicked(new Set(list.filter(j => j.is_mandate).map(j => j.id)))
        })
        .catch(() => setMessage({ tone: 'bad', text: 'Could not load this company’s roles.' }))
    }
    if (tab === 'access' && users === null) {
      fetch('/api/partners/users')
        .then(r => r.json())
        .then(body => setUsers(body.users ?? []))
        .catch(() => setMessage({ tone: 'bad', text: 'Could not load the team list.' }))
    }
  }, [open, tab, companyId, jobs, users])

  async function send(url: string, method: string, body: unknown, ok: string) {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage({ tone: 'bad', text: payload.error ?? 'That did not work.' })
        return false
      }
      setMessage({ tone: 'ok', text: ok })
      router.refresh()
      return true
    } finally {
      setBusy(false)
    }
  }

  async function saveRoles() {
    const chosen = [...picked]
    const original = new Set((jobs ?? []).filter(j => j.is_mandate).map(j => j.id))
    const added = chosen.filter(id => !original.has(id))
    const removed = [...original].filter(id => !picked.has(id))

    if (added.length) {
      const ok = await send(
        '/api/partners/roles',
        'POST',
        { company_id: companyId, job_ids: added },
        `${added.length} role${added.length === 1 ? '' : 's'} added to the desk.`,
      )
      if (!ok) return
    }
    for (const jobId of removed) {
      const res = await fetch(`/api/partners/roles/${jobId}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setMessage({ tone: 'bad', text: body.error ?? 'Could not remove one of the roles.' })
        return
      }
    }
    if (removed.length && !added.length) {
      setMessage({ tone: 'ok', text: 'Selection saved.' })
      router.refresh()
    }
    setJobs(list => (list ?? []).map(j => ({ ...j, is_mandate: picked.has(j.id) })))
  }

  const openJobs = (jobs ?? []).filter(j => j.status === 'open')
  const otherJobs = (jobs ?? []).filter(j => j.status !== 'open')

  /*
    The four steps that decide whether this client can do anything for a scout,
    with the state of each one and a way straight into it.

    This exists because the controls used to live only behind a "Manage" button:
    everything worked and nobody could find it. A client with two mandates, no
    assignees and no brief looks finished from the outside, so the panel says
    plainly which of the four are still missing and what each one is for.
  */
  const steps: { key: Tab; title: string; state: string; done: boolean; action: string }[] = [
    {
      key: 'roles',
      title: 'Mandate roles',
      state: liveRoles
        ? `${liveRoles} role${liveRoles === 1 ? '' : 's'} on the desk`
        : 'No roles picked yet',
      done: liveRoles > 0,
      action: liveRoles ? 'Change' : 'Pick roles',
    },
    {
      key: 'access',
      title: 'Assigned scouts',
      state: assignees.size
        ? `${assignees.size} ${assignees.size === 1 ? 'person' : 'people'} briefed`
        : 'Nobody assigned — every scout sees this client anonymised',
      done: assignees.size > 0,
      action: assignees.size ? 'Change' : 'Assign',
    },
    {
      key: 'brief',
      title: 'Scout brief',
      state:
        briefStatus === 'published'
          ? 'Published'
          : hasBrief
            ? 'Draft — not visible to scouts'
            : 'No brief imported',
      done: briefStatus === 'published',
      action: hasBrief ? 'Replace' : 'Import HTML',
    },
    {
      key: 'visibility',
      title: 'On the desk',
      state: isPublished ? 'Published to the network' : 'Unpublished — admins only',
      done: isPublished,
      action: 'Edit',
    },
  ]

  const outstanding = steps.filter(s => !s.done).length

  return (
    <>
      <section className="rounded-[18px] border border-[#E4E3DC] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4E3DC] px-5 py-3.5">
          <div>
            <h2 className="text-[14.5px] font-semibold text-[#161613]">Client setup</h2>
            <p className="mt-0.5 text-[13px] text-[#9C9C95]">
              {outstanding === 0
                ? 'All four steps done — scouts can work this client.'
                : `${outstanding} of 4 still to do.`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setTab('roles')
              setOpen(true)
            }}
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-full border border-[#D2D1C7] px-4 text-[13.5px] font-semibold text-[#161613] transition-colors hover:border-[#1F3A2F] hover:text-[#1F3A2F] ${FOCUS}`}
          >
            <Settings2 className="h-4 w-4" />
            Manage
          </button>
        </div>

        <ul className="divide-y divide-[#E4E3DC]">
          {steps.map(step => (
            <li key={step.key}>
              <button
                type="button"
                onClick={() => {
                  setTab(step.key)
                  setOpen(true)
                }}
                className={`flex w-full min-h-[58px] items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-[#FAF9F5] ${FOCUS}`}
              >
                <span aria-hidden className="shrink-0">
                  {step.done ? (
                    <Check className="h-4 w-4 text-[#1F3A2F]" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-[#C79A2E]" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium text-[#161613]">{step.title}</span>
                  <span
                    className={`block text-[12.5px] ${step.done ? 'text-[#9C9C95]' : 'text-[#8A6A1F]'}`}
                  >
                    {step.state}
                  </span>
                </span>
                <span className="shrink-0 text-[13px] font-semibold text-[#1F3A2F]">
                  {step.action}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[#B8B8B0]" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[560px]">
        <SheetHeader className="border-b border-[#E4E3DC] px-5 py-4">
          <SheetTitle className="text-left text-[19px] font-semibold text-[#161613]">
            {companyName}
          </SheetTitle>
        </SheetHeader>

        <div className="flex gap-1.5 overflow-x-auto border-b border-[#E4E3DC] px-5 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`min-h-[34px] shrink-0 rounded-full px-3 text-[13px] font-medium transition-colors ${FOCUS} ${
                tab === t.key
                  ? 'bg-[#1F3A2F] text-white'
                  : 'text-[#6E6E68] hover:bg-[#EAE9E1] hover:text-[#161613]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {message && (
            <p
              className={`mb-4 rounded-[10px] px-3 py-2 text-[13px] ${
                message.tone === 'ok'
                  ? 'bg-[#E7EDE9] text-[#1F3A2F]'
                  : 'bg-[#FBEDEB] text-[#A3423A]'
              }`}
            >
              {message.text}
            </p>
          )}

          {tab === 'roles' && (
            <div className="space-y-4">
              <p className="text-[13.5px] leading-relaxed text-[#6E6E68]">
                Tick only the roles we actually have a mandate on. Everything unticked stays on the
                jobs board as sourced, where nobody will be asked to work it.
              </p>
              {jobs === null ? (
                <Loading />
              ) : jobs.length === 0 ? (
                <Empty>
                  No roles are loaded for this company yet. Add one on the jobs page first.
                </Empty>
              ) : (
                <div className="space-y-4">
                  <JobGroup
                    heading={`Open roles (${openJobs.length})`}
                    jobs={openJobs}
                    picked={picked}
                    onToggle={id => setPicked(toggle(picked, id))}
                  />
                  {!!otherJobs.length && (
                    <JobGroup
                      heading={`Draft and closed (${otherJobs.length})`}
                      jobs={otherJobs}
                      picked={picked}
                      onToggle={id => setPicked(toggle(picked, id))}
                      muted
                    />
                  )}
                  <button type="button" onClick={saveRoles} disabled={busy} className={primary}>
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    Save selection
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === 'access' && (
            <div className="space-y-4">
              <p className="text-[13.5px] leading-relaxed text-[#6E6E68]">
                Anyone ticked here sees {companyName} by name, reads the brief and can submit to every
                live role under it. Access is per company, never per role.
              </p>
              {users === null ? (
                <Loading />
              ) : (
                <>
                  <ul className="divide-y divide-[#E4E3DC] rounded-[14px] border border-[#E4E3DC]">
                    {users.map(u => (
                      <li key={u.user_id}>
                        <label className="flex min-h-[52px] cursor-pointer items-center gap-3 px-3.5 py-2.5">
                          <input
                            type="checkbox"
                            checked={assignees.has(u.user_id)}
                            onChange={() => setAssignees(toggle(assignees, u.user_id))}
                            className="h-4 w-4 shrink-0 accent-[#1F3A2F]"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14px] font-medium text-[#161613]">
                              {u.full_name || u.email}
                            </span>
                            <span className="block truncate text-[12.5px] text-[#9C9C95]">
                              {u.role.replace(/_/g, ' ')} · {u.email}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      send(
                        '/api/partners/assignments',
                        'POST',
                        { company_id: companyId, user_ids: [...assignees] },
                        'Access updated.',
                      )
                    }
                    className={primary}
                  >
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    Save access
                  </button>
                </>
              )}
            </div>
          )}

          {tab === 'brief' && (
            <div className="space-y-4">
              <p className="text-[13.5px] leading-relaxed text-[#6E6E68]">
                Paste the brief’s HTML file. It is read once into structured content and rendered by
                the app from then on — so it reflows on a phone, obeys who is assigned, and can be
                revised without re-sending a file.
              </p>
              {hasBrief && (
                <p className="rounded-[10px] bg-[#EAE9E1] px-3 py-2 text-[12.5px] text-[#6E6E68]">
                  A {briefStatus === 'published' ? 'published' : 'draft'} brief already exists.
                  Importing replaces it.
                </p>
              )}
              {/* The brief exists as a file, so picking it is the natural
                  action; the textarea below is the fallback for a paste. The
                  file is read in the browser and posted as text — no upload
                  endpoint, no storage bucket, nothing to clean up later. */}
              <label
                className={`flex min-h-[52px] cursor-pointer items-center justify-center gap-2 rounded-[14px] border border-dashed border-[#D2D1C7] bg-[#FAF9F5] px-4 text-[13.5px] font-semibold text-[#1F3A2F] transition-colors hover:border-[#1F3A2F] ${FOCUS}`}
              >
                <Upload className="h-4 w-4" />
                {fileName ? `Loaded ${fileName}` : 'Choose the brief’s .html file'}
                <input
                  type="file"
                  accept=".html,.htm,text/html"
                  className="hidden"
                  onChange={async e => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    setFileName(file.name)
                    setHtml(await file.text())
                    setMessage(null)
                  }}
                />
              </label>

              <label className={label}>
                {html ? `Brief HTML — ${html.length.toLocaleString()} characters` : 'Or paste the HTML'}
                <textarea
                  rows={html ? 4 : 8}
                  value={html}
                  onChange={e => {
                    setHtml(e.target.value)
                    setFileName(null)
                  }}
                  placeholder="<!DOCTYPE html> …"
                  className={`${input} font-mono text-[12px] leading-relaxed`}
                />
              </label>
              <label className="flex cursor-pointer items-center gap-2.5 text-[13.5px] text-[#161613]">
                <input
                  type="checkbox"
                  checked={publishBrief}
                  onChange={e => setPublishBrief(e.target.checked)}
                  className="h-4 w-4 accent-[#1F3A2F]"
                />
                Publish it to assigned scouts straight away
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || !html.trim()}
                  onClick={async () => {
                    const ok = await send(
                      '/api/partners/briefs',
                      'POST',
                      { company_id: companyId, html, publish: publishBrief },
                      publishBrief ? 'Brief imported and published.' : 'Brief imported as a draft.',
                    )
                    if (ok) {
                      setHtml('')
                      setFileName(null)
                    }
                  }}
                  className={primary}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Import brief
                </button>
                {briefId && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      send(
                        `/api/partners/briefs/${briefId}`,
                        'PATCH',
                        { status: briefStatus === 'published' ? 'draft' : 'published' },
                        briefStatus === 'published' ? 'Brief unpublished.' : 'Brief published.',
                      )
                    }
                    className={`inline-flex min-h-[42px] items-center rounded-full border border-[#D2D1C7] px-4 text-[14px] font-semibold text-[#161613] transition-colors hover:border-[#1F3A2F] ${FOCUS}`}
                  >
                    {briefStatus === 'published' ? 'Unpublish' : 'Publish existing'}
                  </button>
                )}
              </div>
            </div>
          )}

          {tab === 'visibility' && (
            <div className="space-y-4">
              <p className="text-[13.5px] leading-relaxed text-[#6E6E68]">
                Publishing puts this client on the desk for the whole network — anonymised, with its
                live role titles and payouts visible, so scouts can ask to be put on it.
              </p>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-[14px] border border-[#E4E3DC] px-3.5 py-3 text-[13.5px] text-[#161613]">
                <input
                  type="checkbox"
                  checked={isPublished}
                  onChange={e => setIsPublished(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#1F3A2F]"
                />
                <span>
                  Show on the partner desk
                  <span className="mt-0.5 block text-[12.5px] text-[#9C9C95]">
                    Unpublished clients are visible to admins only.
                  </span>
                </span>
              </label>
              <label className={label}>
                Anonymised name
                <input
                  value={alias}
                  onChange={e => setAlias(e.target.value)}
                  placeholder="e.g. Series A AI infrastructure company"
                  className={input}
                />
                <span className="mt-1.5 block text-[12px] text-[#9C9C95]">
                  What an unassigned scout sees. Left blank, we compose one from the stage and
                  industry.
                </span>
              </label>
              <label className={label}>
                Public blurb
                <textarea
                  rows={3}
                  value={blurb}
                  onChange={e => setBlurb(e.target.value)}
                  placeholder="One or two sentences that describe the company without naming it."
                  className={input}
                />
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  send(
                    `/api/partners/companies/${companyId}`,
                    'PATCH',
                    { is_published: isPublished, anon_alias: alias, public_blurb: blurb },
                    'Visibility saved.',
                  )
                }
                className={primary}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Save
              </button>
            </div>
          )}
        </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

function toggle(set: Set<string>, id: string): Set<string> {
  const next = new Set(set)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

function Loading() {
  return (
    <p className="flex items-center gap-2 py-6 text-[13.5px] text-[#9C9C95]">
      <Loader2 className="h-4 w-4 animate-spin" />
      Loading…
    </p>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-6 text-[13.5px] leading-relaxed text-[#5F5F58]">
      {children}
    </p>
  )
}

function JobGroup({
  heading,
  jobs,
  picked,
  onToggle,
  muted = false,
}: {
  heading: string
  jobs: JobOption[]
  picked: Set<string>
  onToggle: (id: string) => void
  muted?: boolean
}) {
  if (!jobs.length) return null
  return (
    <div>
      <p className="mb-2 text-[13px] font-medium text-[#8A8A82]">
        {heading}
      </p>
      <ul className="divide-y divide-[#E4E3DC] rounded-[14px] border border-[#E4E3DC]">
        {jobs.map(job => {
          const salary = formatSalary(job.salary_min, job.salary_max)
          return (
            <li key={job.id}>
              <label className="flex min-h-[52px] cursor-pointer items-center gap-3 px-3.5 py-2.5">
                <input
                  type="checkbox"
                  checked={picked.has(job.id)}
                  onChange={() => onToggle(job.id)}
                  className="h-4 w-4 shrink-0 accent-[#1F3A2F]"
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-[14px] font-medium ${muted ? 'text-[#6E6E68]' : 'text-[#161613]'}`}
                  >
                    {job.title}
                  </span>
                  <span className="block truncate text-[12.5px] text-[#9C9C95]">
                    {[job.status !== 'open' ? job.status : null, job.location, salary]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </span>
                </span>
              </label>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
