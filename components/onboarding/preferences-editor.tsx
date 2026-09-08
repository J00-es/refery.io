'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PreferencesFields, preferencesComplete, type PreferencesValue } from './preferences-fields'

/**
 * Preferences on the Start page: read as a sentence, edited as chips, saved
 * with one button. Saving confirms them, which is what lets the matcher
 * suggest a search.
 */
export function PreferencesEditor({ initial, confirmed }: { initial: PreferencesValue; confirmed: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(!confirmed)
  const [value, setValue] = useState<PreferencesValue>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!preferencesComplete(value)) {
      setError('Pick at least one city and one kind of people.')
      return
    }
    setBusy(true)
    setError(null)
    const res = await fetch('/api/partners/preferences', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) })
    setBusy(false)
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? 'That did not save.')
      return
    }
    setOpen(false)
    router.refresh()
  }

  if (!open) {
    const summary = [
      value.network_cities.slice(0, 3).join(', '),
      value.functions.slice(0, 3).join(', '),
      value.stages.slice(0, 3).join(', '),
    ]
      .filter(Boolean)
      .join(' · ')
    return (
      <div className="mt-1 flex items-center justify-between gap-3">
        <p className="text-[13px] text-[#6E6E68]">{summary || 'Nothing saved yet.'}</p>
        <button type="button" onClick={() => setOpen(true)} className="shrink-0 text-[13px] font-semibold text-[#1F3A2F] underline underline-offset-2">
          Change
        </button>
      </div>
    )
  }

  return (
    <div className="mt-3">
      <PreferencesFields value={value} onChange={setValue} />
      {error && <p className="mt-2 text-[12.5px] text-[#A3423A]">{error}</p>}
      <div className="mt-4 flex items-center gap-2">
        <button type="button" disabled={busy} onClick={save} className="min-h-[44px] rounded-full bg-[#1F3A2F] px-5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {busy ? 'Saving' : confirmed ? 'Save changes' : 'Confirm and find me a search'}
        </button>
        {confirmed && (
          <button type="button" onClick={() => { setValue(initial); setOpen(false) }} className="min-h-[44px] px-3 text-[13px] font-medium text-[#6E6E68]">
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
