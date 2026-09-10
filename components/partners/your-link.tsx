'use client'

import { useEffect, useState } from 'react'
import { Check, Copy, Link2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { BTN_QUIET, CARD, FOCUS, META, RULE } from '@/lib/desk-ui'

/**
 * A partner's own link, with the code they can make their own.
 *
 * Two shapes: the card on Start, and a button in the Candidates header that
 * opens the same thing in a dialog. Both read one endpoint. A chosen code is
 * checked for uniqueness by the server, which answers with three free
 * alternatives when it is taken; the old code keeps working after a change.
 */
interface LinkData {
  code: string
  url: string
  stats: { opens: number; arrivals: number; confirmed: number; waiting: number }
  firstName: string | null
}

const APP_HOST = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'https://refery.xyz').replace(/^https?:\/\//, '').replace(/\/$/, '')

function message(url: string): string {
  return `I work with Refery, which places senior people at seed to Series B startups through people who already know them. If you are open to the right thing, share your CV here and I will take it from there: ${url}\n\nNothing goes to a company until you say yes.`
}

function useLink() {
  const [data, setData] = useState<LinkData | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    fetch('/api/partners/share-code')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('no link'))))
      .then(setData)
      .catch(() => setError('Could not load your link. Reload the page.'))
  }, [])
  return { data, setData, error }
}

function CopyPill({ text, label, gold = false }: { text: string; label: string; gold?: boolean }) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle')
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setState('done')
    } catch {
      setState('failed')
    }
    setTimeout(() => setState('idle'), 2200)
  }
  return (
    <button type="button" onClick={copy} aria-live="polite" className={gold ? `inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-full bg-[#C8A24B] px-4 text-[12.5px] font-semibold text-[#173B2D] transition-colors hover:bg-[#D8B45C] ${FOCUS}` : `${BTN_QUIET} min-h-[38px] px-4 text-[12.5px]`}>
      {state === 'done' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {state === 'done' ? 'Copied' : state === 'failed' ? 'Copy failed' : label}
    </button>
  )
}

function Personalise({ data, onChange }: { data: LinkData; onChange: (d: LinkData) => void }) {
  const [open, setOpen] = useState(false)
  const [wanted, setWanted] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<{ message: string; suggestions: string[] } | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [rotating, setRotating] = useState(false)

  async function save(code = wanted) {
    setBusy(true)
    setProblem(null)
    setSaved(null)
    try {
      const res = await fetch('/api/partners/share-code', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })
      const json = (await res.json().catch(() => ({}))) as { code?: string; url?: string; error?: string; suggestions?: string[] }
      if (!res.ok || !json.code || !json.url) {
        setProblem({ message: json.error ?? 'That did not save.', suggestions: json.suggestions ?? [] })
        return
      }
      onChange({ ...data, code: json.code, url: json.url })
      setSaved(`Done. Your link is now ${APP_HOST}/r/${json.code}. The old one keeps working.`)
      setWanted('')
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  async function rotate() {
    if (!confirm('Get a fresh link? Every link you have already sent stops working this minute. Use this only if your link is being passed around.')) return
    setRotating(true)
    try {
      const res = await fetch('/api/partners/share-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rotate: true }) })
      const json = (await res.json().catch(() => ({}))) as { code?: string; url?: string }
      if (res.ok && json.code && json.url) {
        onChange({ ...data, code: json.code, url: json.url })
        setSaved('Fresh link ready. The old ones show a closed page.')
      }
    } finally {
      setRotating(false)
    }
  }

  return (
    <div className={`border-t px-4 py-3 ${RULE}`}>
      {!open ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={META}>Want something easier to remember, like your name? You can change it any time; old links keep working.</p>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setOpen(true)} className={`text-[13px] font-semibold text-[#1F3A2F] ${FOCUS}`}>Personalise</button>
            <button type="button" onClick={rotate} disabled={rotating} className={`text-[13px] text-[#9C9C95] hover:text-[#161613] ${FOCUS}`}>{rotating ? 'One moment' : 'Get a fresh link'}</button>
          </div>
        </div>
      ) : (
        <form onSubmit={e => { e.preventDefault(); void save() }} className="grid gap-2">
          <label className="text-[13px] font-medium text-[#2A2A26]">Your link</label>
          <div className="flex items-stretch gap-2">
            <span className="flex items-center rounded-[12px] border border-[#D2D1C7] bg-[#FAF9F5] px-3 font-mono text-[12.5px] text-[#6E6E68]">{APP_HOST}/r/</span>
            <input value={wanted} onChange={e => setWanted(e.target.value)} placeholder="your-name" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={30} className={`min-h-[42px] min-w-0 flex-1 rounded-[12px] border border-[#D2D1C7] bg-white px-3 font-mono text-[13px] text-[#161613] outline-none focus:border-[#1F3A2F]`} />
          </div>
          <p className={META}>Letters, numbers and hyphens. Three to thirty characters.</p>
          {problem && (
            <div className="rounded-[12px] border border-[#E4D9B8] bg-[#FFF8EC] px-3 py-2.5">
              <p className="text-[13px] text-[#2A2A26]">{problem.message}</p>
              {problem.suggestions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {problem.suggestions.map(s => (
                    <button key={s} type="button" onClick={() => { setWanted(s); void save(s) }} className={`rounded-full border border-[#1F3A2F] bg-white px-3 py-1.5 font-mono text-[12.5px] font-semibold text-[#1F3A2F] ${FOCUS}`}>{s}</button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={busy || !wanted.trim()} className={`inline-flex min-h-[40px] items-center rounded-full bg-[#1F3A2F] px-4 text-[13px] font-semibold text-white disabled:opacity-50 ${FOCUS}`}>{busy ? 'Checking' : 'Use this link'}</button>
            <button type="button" onClick={() => { setOpen(false); setProblem(null) }} className={`${BTN_QUIET} min-h-[40px] px-4 text-[13px]`}>Cancel</button>
          </div>
        </form>
      )}
      {saved && <p className="mt-2 text-[12.5px] text-[#1F3A2F]">{saved}</p>}
    </div>
  )
}

function Body({ data, onChange }: { data: LinkData; onChange: (d: LinkData) => void }) {
  return (
    <>
      <div className="flex flex-col gap-2 px-4 pb-3.5 pt-3 sm:flex-row sm:items-center">
        <span className="min-w-0 flex-1 truncate rounded-[12px] border border-[#D2D1C7] bg-white px-3 py-2.5 font-mono text-[13px] text-[#161613]">{data.url.replace(/^https?:\/\//, '')}</span>
        <div className="flex gap-2">
          <CopyPill text={data.url} label="Copy link" gold />
          <CopyPill text={message(data.url)} label="Copy a message" />
        </div>
      </div>
      <div className={`grid grid-cols-3 border-t ${RULE}`}>
        {[
          [data.stats.opens, 'opened'],
          [data.stats.arrivals, 'came through'],
          [data.stats.waiting, 'waiting for your yes'],
        ].map(([n, l], i) => (
          <div key={l} className={`px-4 py-3 ${i ? `border-l ${RULE}` : ''}`}>
            <p className={`text-[22px] font-semibold leading-none tracking-[-0.02em] ${i === 2 && Number(n) > 0 ? 'text-[#8A6A1F]' : 'text-[#161613]'}`}>{n}</p>
            <p className="mt-1 text-[12.5px] text-[#9C9C95]">{l}</p>
          </div>
        ))}
      </div>
      <Personalise data={data} onChange={onChange} />
      <p className={`border-t px-4 py-3 ${RULE} ${META}`}>Anyone who arrives is yours once you confirm. Not yours? Say so and they never reach your list.</p>
    </>
  )
}

export function YourLinkCard() {
  const { data, setData, error } = useLink()
  return (
    <section className={`overflow-hidden ${CARD}`}>
      <div className="px-4 pt-4">
        <span className="text-[13px] font-semibold">Your link</span>
        <p className={`mt-0.5 ${META}`}>Send it to anyone you would put your name behind. They share a CV in two minutes and land in your Candidates as yours.</p>
      </div>
      {data ? <Body data={data} onChange={setData} /> : <p className={`px-4 py-4 ${META}`}>{error ?? 'Loading your link'}</p>}
    </section>
  )
}

export function YourLinkButton() {
  const { data, setData, error } = useLink()
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className={`${BTN_QUIET} min-h-[40px] px-4 text-[13.5px]`}>
          <Link2 className="h-4 w-4" />
          Your link
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[min(96vw,560px)] overflow-y-auto rounded-[16px] border-[#E4E3DC] bg-white p-0">
        <DialogHeader className="px-4 pt-4 text-left">
          <DialogTitle className="text-[17px] font-semibold text-[#161613]">Your link</DialogTitle>
          <p className={META}>Send it to anyone you would put your name behind. They share a CV in two minutes and land here as yours.</p>
        </DialogHeader>
        {data ? <Body data={data} onChange={setData} /> : <p className={`px-4 pb-4 ${META}`}>{error ?? 'Loading your link'}</p>}
      </DialogContent>
    </Dialog>
  )
}
