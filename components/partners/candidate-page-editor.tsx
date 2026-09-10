'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy } from 'lucide-react'
import type { CandidatePageRow, InterviewStep } from '@/lib/candidate-pages'
import { BTN_PRIMARY, BTN_QUIET, BTN_TEXT, CARD, CHIP, CHIP_VALUE, CHIP_WARN, FIELD, FIELD_LABEL, FOCUS, H3, LEDE, META } from '@/lib/desk-ui'

/**
 * Lily's editor for a search's candidate page. Everything saves live: the
 * page went up on its own when the search did, and she corrects it here.
 * The original JD sits beside it, never shown outside; "Re-draft" runs the
 * pass again from it and keeps the toggles.
 */
interface Props {
  jobId: string
  page: CandidatePageRow
  url: string
  original: string | null
  originalSource: string | null
  jobPostUrl: string | null
}

function stepsToText(steps: InterviewStep[]): string {
  return steps.map(s => (s.detail ? `${s.title} | ${s.detail}` : s.title)).join('\n')
}
function textToSteps(text: string): InterviewStep[] {
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => {
      const [title, ...rest] = l.split('|')
      return { title: title.trim(), detail: rest.join('|').trim() || null }
    })
}

export function CandidatePageEditor({ jobId, page: initial, url: initialUrl, original, originalSource, jobPostUrl }: Props) {
  const router = useRouter()
  const [, start] = useTransition()
  const [page, setPage] = useState(initial)
  const [url, setUrl] = useState(initialUrl)
  const [headline, setHeadline] = useState(initial.headline ?? '')
  const [companyLine, setCompanyLine] = useState(initial.company_line ?? '')
  const [blurb, setBlurb] = useState(initial.company_blurb ?? '')
  const [jd, setJd] = useState(initial.jd_text ?? '')
  const [requirements, setRequirements] = useState(initial.requirements.join('\n'))
  const [ticked, setTicked] = useState<string[]>(initial.good_to_know)
  const [extra, setExtra] = useState('')
  const [steps, setSteps] = useState(stepsToText(initial.interview_steps))
  const [showSalary, setShowSalary] = useState(initial.show_salary)
  const [showEquity, setShowEquity] = useState(initial.show_equity)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pasted, setPasted] = useState('')
  const [confirmRotate, setConfirmRotate] = useState(false)

  const offered = Array.from(new Set([...initial.good_to_know_offered, ...initial.good_to_know]))
  const flags = page.draft_flags ?? {}

  async function call(method: 'PATCH' | 'POST', body: Record<string, unknown>, label: string) {
    setBusy(label)
    setNote(null)
    try {
      const res = await fetch(`/api/partners/roles/${jobId}/candidate-page`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = (await res.json().catch(() => ({}))) as { page?: CandidatePageRow; url?: string; slug?: string; error?: string }
      if (!res.ok) {
        setNote(json.error ?? 'That did not save.')
        return null
      }
      if (json.page) setPage(json.page)
      if (json.url) setUrl(json.url)
      return json
    } finally {
      setBusy(null)
    }
  }

  async function save() {
    const good = [...ticked, ...extra.split('\n').map(l => l.trim()).filter(Boolean)]
    const r = await call('PATCH', { headline, company_line: companyLine, company_blurb: blurb, jd_text: jd, requirements, good_to_know: good, interview_steps: textToSteps(steps), show_salary: showSalary, show_equity: showEquity }, 'save')
    if (r?.page) {
      setTicked(r.page.good_to_know)
      setExtra('')
      setNote('Saved. The page shows this now.')
      start(() => router.refresh())
    }
  }

  async function redraft() {
    if (!confirm('Re-draft from the original JD? Your edits to the text are replaced; the link and the toggles stay.')) return
    const r = await call('POST', { action: 'redraft' }, 'redraft')
    if (r?.page) {
      setHeadline(r.page.headline ?? '')
      setCompanyLine(r.page.company_line ?? '')
      setBlurb(r.page.company_blurb ?? '')
      setJd(r.page.jd_text ?? '')
      setRequirements(r.page.requirements.join('\n'))
      setTicked(r.page.good_to_know)
      setSteps(stepsToText(r.page.interview_steps))
      setNote('Re-drafted and live.')
      start(() => router.refresh())
    }
  }

  async function pasteOriginal() {
    const r = await call('POST', { action: 'paste_original', text: pasted }, 'paste')
    if (r?.page) {
      setJd(r.page.jd_text ?? '')
      setRequirements(r.page.requirements.join('\n'))
      setTicked(r.page.good_to_know)
      setSteps(stepsToText(r.page.interview_steps))
      setPasted('')
      setNote('Original kept and the page re-drafted from it.')
      start(() => router.refresh())
    }
  }

  async function setStatus(status: 'published' | 'draft') {
    const r = await call('PATCH', { status }, 'status')
    if (r?.page) setNote(status === 'published' ? 'Live.' : 'Taken down. The link shows nothing until you publish again.')
  }

  async function rotate() {
    const r = await call('POST', { action: 'rotate' }, 'rotate')
    setConfirmRotate(false)
    if (r?.url) {
      setNote('New link. Every copy of the old one is dead.')
      start(() => router.refresh())
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setNote('Copy failed; select the link and copy it by hand.')
    }
  }

  const live = page.status === 'published'
  const toggle = (on: boolean, set: (v: boolean) => void) => (
    <button type="button" onClick={() => set(!on)} aria-pressed={on} className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? 'bg-[#1F3A2F]' : 'bg-[#D2D1C7]'} ${FOCUS}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  )

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="grid gap-4">
        <section className={`p-4 sm:p-5 ${CARD}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={H3}>The role</p>
            <span className={META}>{flags.model ? `Drafted by ${flags.model}${typeof flags.cost_usd === 'number' ? ` · $${flags.cost_usd.toFixed(3)}` : ''}` : flags.fallback ? `Rule pass only: ${flags.fallback}` : 'Drafted'}</span>
          </div>
          <label className="mt-3 block"><span className={FIELD_LABEL}>Headline</span><input value={headline} onChange={e => setHeadline(e.target.value)} className={FIELD} /></label>
          <label className="mt-3 block"><span className={FIELD_LABEL}>Company line <span className="font-normal text-[#9C9C95]">never the name</span></span><input value={companyLine} onChange={e => setCompanyLine(e.target.value)} className={FIELD} /></label>
          <label className="mt-3 block"><span className={FIELD_LABEL}>Company blurb</span><textarea value={blurb} onChange={e => setBlurb(e.target.value)} rows={3} className={FIELD} /></label>
          <label className="mt-3 block"><span className={FIELD_LABEL}>The job description, candidate version</span><textarea value={jd} onChange={e => setJd(e.target.value)} rows={18} className={`${FIELD} font-[inherit] leading-[1.6]`} /></label>
          {(flags.removed?.length || flags.kept?.length) ? (
            <p className={`mt-2 ${META}`}>
              {flags.removed?.length ? <>Removed: {flags.removed.slice(0, 8).join(', ')}{flags.removed.length > 8 ? ` and ${flags.removed.length - 8} more` : ''}. </> : null}
              {flags.kept?.length ? <>Kept, for your eye: <span className="text-[#8A6A1F]">{flags.kept.slice(0, 10).join(', ')}</span>.</> : null}
            </p>
          ) : null}
          <label className="mt-3 block"><span className={FIELD_LABEL}>What they are looking for <span className="font-normal text-[#9C9C95]">one line each</span></span><textarea value={requirements} onChange={e => setRequirements(e.target.value)} rows={5} className={FIELD} /></label>
        </section>

        <section className={`p-4 sm:p-5 ${CARD}`}>
          <p className={H3}>Good to know</p>
          <p className={`mt-1 ${LEDE}`}>Drafted from the intake notes. Tick what a candidate may read. Quotes, hunting grounds and the bar are never offered.</p>
          <div className="mt-3 grid gap-2">
            {offered.map(line => {
              const on = ticked.includes(line)
              return (
                <label key={line} className="flex cursor-pointer items-start gap-2.5 text-[14px] leading-[1.5] text-[#2A2A26]">
                  <input type="checkbox" checked={on} onChange={e => setTicked(e.target.checked ? [...ticked, line] : ticked.filter(l => l !== line))} className="mt-1 h-4 w-4 accent-[#1F3A2F]" />
                  <span>{line}</span>
                </label>
              )
            })}
            {!offered.length && <p className={META}>Nothing drafted. Add lines below.</p>}
          </div>
          {flags.softened?.length ? <p className={`mt-3 ${META}`}>Left out on purpose: {flags.softened.slice(0, 5).join(' · ')}</p> : null}
          <label className="mt-3 block"><span className={FIELD_LABEL}>Add lines <span className="font-normal text-[#9C9C95]">one per line</span></span><textarea value={extra} onChange={e => setExtra(e.target.value)} rows={2} className={FIELD} /></label>
        </section>

        <section className={`p-4 sm:p-5 ${CARD}`}>
          <p className={H3}>How they interview</p>
          <p className={`mt-1 ${LEDE}`}>One step per line, &ldquo;title | detail&rdquo;. Names of people were removed by the draft.</p>
          <textarea value={steps} onChange={e => setSteps(e.target.value)} rows={4} className={`mt-3 ${FIELD}`} />
        </section>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={save} disabled={!!busy} className={BTN_PRIMARY}>{busy === 'save' ? 'Saving' : 'Save, live at once'}</button>
          <button type="button" onClick={redraft} disabled={!!busy} className={BTN_QUIET}>{busy === 'redraft' ? 'Drafting' : 'Re-draft from the original'}</button>
          {note && <span className="text-[13px] text-[#1F3A2F]">{note}</span>}
        </div>
      </div>

      <div className="grid content-start gap-4">
        <section className={`p-4 ${CARD}`}>
          <div className="flex items-center justify-between gap-2">
            <p className={H3}>Link</p>
            <span className={live ? CHIP_VALUE : CHIP_WARN}>{live ? 'Live' : 'Not live'}</span>
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate rounded-[12px] border border-[#D2D1C7] bg-white px-3 py-2.5 font-mono text-[12.5px]">{url.replace(/^https?:\/\//, '')}</span>
            <button type="button" onClick={copy} className={`inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-full bg-[#C8A24B] px-4 text-[12.5px] font-semibold text-[#173B2D] hover:bg-[#D8B45C] ${FOCUS}`}>{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? 'Copied' : 'Copy'}</button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
            <a href={url} target="_blank" rel="noopener noreferrer" className={BTN_TEXT}>Open the page</a>
            {live ? <button type="button" onClick={() => setStatus('draft')} className={BTN_TEXT}>Take it down</button> : <button type="button" onClick={() => setStatus('published')} className={BTN_TEXT}>Publish</button>}
            {!confirmRotate ? (
              <button type="button" onClick={() => setConfirmRotate(true)} className={`text-[13px] text-[#9C9C95] hover:text-[#161613] ${FOCUS}`}>Rotate link</button>
            ) : (
              <span className="flex items-center gap-2 text-[13px]"><button type="button" onClick={rotate} className="font-semibold text-[#9C3F37]">Break the old link</button><button type="button" onClick={() => setConfirmRotate(false)} className={BTN_TEXT}>Keep it</button></span>
            )}
          </div>
          <p className={`mt-3 ${META}`}>Partners copy it with their own code attached. When the search closes the page shows a closed state with the share-your-CV door; reopening the search revives it.</p>
        </section>

        <section className={`p-4 ${CARD}`}>
          <p className={H3}>On the page</p>
          <div className="mt-3 grid gap-3">
            <div className="flex items-start justify-between gap-3"><div><p className="text-[13.5px] font-semibold">Salary band</p><p className={META}>From the search&rsquo;s min and max.</p></div>{toggle(showSalary, setShowSalary)}</div>
            <div className="flex items-start justify-between gap-3"><div><p className="text-[13.5px] font-semibold">Equity chip</p><p className={META}>&ldquo;Equity&rdquo;, no percentage.</p></div>{toggle(showEquity, setShowEquity)}</div>
            <div className="flex items-start justify-between gap-3"><div><p className="text-[13.5px] font-semibold text-[#9C9C95]">Fee, payout, bar, intake notes, HM names, URL</p><p className={META}>Never.</p></div><span className={CHIP}>off</span></div>
          </div>
          <p className={`mt-3 ${META}`}>Toggles save with the button on the left.</p>
        </section>

        <section className={`p-4 ${CARD}`}>
          <p className={H3}>Original JD</p>
          <p className={`mt-1 ${LEDE}`}>{original ? `On file (${originalSource ?? 'unknown'} source), never shown to anyone outside.` : 'Nothing on file yet. Paste the posting and the page is re-drafted from it.'}{jobPostUrl ? ' ' : ''}{jobPostUrl && <a href={jobPostUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#1F3A2F] underline underline-offset-2">Posting</a>}</p>
          {original && (
            <details className="mt-2">
              <summary className={`cursor-pointer list-none ${BTN_TEXT}`}>View original</summary>
              <pre className="mt-2 max-h-[320px] overflow-auto whitespace-pre-wrap rounded-[12px] border border-[#E4E3DC] bg-[#FAF9F5] p-3 font-[inherit] text-[12.5px] leading-[1.55] text-[#2A2A26]">{original}</pre>
            </details>
          )}
          <textarea value={pasted} onChange={e => setPasted(e.target.value)} rows={4} placeholder="Paste the whole posting here" className={`mt-3 ${FIELD}`} />
          <button type="button" onClick={pasteOriginal} disabled={!!busy || pasted.trim().length < 80} className={`mt-2 ${BTN_QUIET} min-h-[40px] px-4 text-[13px]`}>{busy === 'paste' ? 'Drafting' : 'Keep as the original and re-draft'}</button>
        </section>
      </div>
    </div>
  )
}
