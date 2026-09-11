'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Plug } from 'lucide-react'
import { FOCUS } from '@/lib/candidate-ui'

type ToolRow = { name: string; kind: 'read' | 'write'; description: string }
type CallRow = { id: string; tool: string; kind: 'read' | 'write'; ok: boolean; summary: string | null; created_at: string; args: Record<string, unknown> }
type State = {
  endpoint: string
  token: { issued: boolean; hint?: string; created_at?: string; last_used_at?: string | null }
  writes: Record<string, boolean>
  tools: ToolRow[]
  calls: CallRow[]
}

/** The one-line meaning of each verb on the page; the tool description is for the model. */
const BLURB: Record<string, string> = {
  desk_inbox: 'everything waiting on you',
  candidate_brief: 'grade, evidence, seat fits, owner · surname and contact hidden until consent',
  search_status: 'stage, days waiting, partners and submissions per search',
  partner_shortlist: 'who to propose a search to, and why',
  ownership_check: 'who owns this person, until when',
  spend_status: 'the ledger against the cap',
  draft_email: 'returns the text, never sends',
  decide_candidate: 'the card reactions, mirrored to the Slack thread',
  propose_search: 'the assignment plus its email',
  send_desk_email: 'asks you every time, no exceptions',
  run_bench: 're-match a seat against the bench now',
  note: 'a line onto a candidate or a search',
}

const when = (iso?: string | null) => {
  if (!iso) return 'never'
  const d = new Date(iso)
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
}

const btn = 'inline-flex min-h-[32px] items-center rounded-full border px-3 text-[12.5px] font-semibold'
const forest = 'border-[#1F3A2F] bg-[#1F3A2F] text-white'
const quiet = 'border-[#D2D1C7] text-[#161613]'

/**
 * The desk MCP, connected. A local server, one user, and a record of everything
 * it did. Reads are always on. Writes are off until you turn them on.
 */
export function DeskMcp() {
  const [s, setS] = useState<State | null>(null)
  const [fresh, setFresh] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    fetch('/api/admin/mcp')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: State) => setS(d))
      .catch(() => setS(null))
  }, [])
  useEffect(load, [load])

  const flash = (m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(null), 2500)
  }

  async function toggle(name: string, on: boolean) {
    if (!s) return
    setS({ ...s, writes: { ...s.writes, [name]: on } })
    const res = await fetch('/api/admin/mcp', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ writes: { [name]: on } }) })
    flash(res.ok ? `${name} is ${on ? 'on' : 'off'}.` : 'Could not save.')
  }

  async function issue() {
    setBusy(true)
    const res = await fetch('/api/admin/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'issue' }) })
    setBusy(false)
    if (!res.ok) return flash('Could not issue a key.')
    const d = (await res.json()) as { token: string }
    setFresh(d.token)
    load()
  }

  async function revoke() {
    setBusy(true)
    const res = await fetch('/api/admin/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'revoke' }) })
    setBusy(false)
    setFresh(null)
    flash(res.ok ? 'Key revoked. The server answers nothing until a new one is issued.' : 'Could not revoke.')
    load()
  }

  const endpoint = s?.endpoint ?? 'https://refery.xyz/api/mcp'
  const command = `claude mcp add --transport http refery-desk ${endpoint} --header "Authorization: Bearer ${fresh ?? '<key>'}"`

  return (
    <Card id="mcp">
      <CardHeader className="px-4 sm:px-6">
        <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
          <Plug className="h-4 w-4 sm:h-5 sm:w-5" />
          Desk MCP
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          The desk as tools in your assistant: one user, one key, and a record of everything it did. Reads are always on. Writes are off until you turn them on.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
        {!s ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-4 text-[13.5px]">
            <div className="rounded-lg border p-3 sm:p-4">
              <p className="font-medium">The key</p>
              {fresh ? (
                <div className="mt-2 space-y-2">
                  <p className="text-[12.5px] text-[#8A3B2B]">Copy it now. It is shown once and only its fingerprint is kept.</p>
                  <code className="block overflow-x-auto rounded-md border border-[#D2D1C7] bg-[#F2F1EB] px-2 py-1.5 text-[12px]">{fresh}</code>
                  <p className="text-[12.5px] text-[#6E6E68]">In Claude Code, on any machine, once:</p>
                  <code className="block overflow-x-auto whitespace-pre rounded-md border border-[#D2D1C7] bg-[#F2F1EB] px-2 py-1.5 text-[12px]">{command}</code>
                  <p className="text-[12.5px] text-[#6E6E68]">Then ask it "what needs me today". Claude Desktop takes the same URL and header in its connector settings.</p>
                </div>
              ) : s.token.issued ? (
                <p className="mt-1 text-[12.5px] text-[#6E6E68]">
                  A key ending in <span className="font-mono">{s.token.hint}</span> was issued {when(s.token.created_at)} and last used {when(s.token.last_used_at)}. Endpoint <span className="font-mono">{endpoint}</span>.
                </p>
              ) : (
                <p className="mt-1 text-[12.5px] text-[#6E6E68]">No key yet. The endpoint answers nothing until one is issued.</p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" disabled={busy} onClick={issue} className={`${btn} ${FOCUS} ${forest}`}>
                  {s.token.issued ? 'Rotate the key' : 'Issue a key'}
                </button>
                {s.token.issued && (
                  <button type="button" disabled={busy} onClick={revoke} className={`${btn} ${FOCUS} ${quiet}`}>
                    Revoke
                  </button>
                )}
              </div>
            </div>

            <div className="rounded-lg border">
              {s.tools.map(t => {
                const on = t.kind === 'read' || s.writes[t.name] === true
                return (
                  <div key={t.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[#E4E3DC] px-3 py-2.5 last:border-b-0 sm:px-4">
                    <span className="font-mono text-[12.5px] font-semibold">{t.name}</span>
                    <span className="min-w-0 flex-1 text-[12.5px] text-[#6E6E68]">{BLURB[t.name] ?? t.description}</span>
                    <span className={`text-[11px] font-mono uppercase tracking-wide ${t.kind === 'write' ? 'text-[#8A6A1F]' : 'text-[#9C9C95]'}`}>{t.kind}</span>
                    {t.kind === 'read' ? (
                      <span className="text-[12px] text-[#1F3A2F]">always on</span>
                    ) : (
                      <button type="button" onClick={() => toggle(t.name, !on)} className={`${btn} min-h-[28px] px-2.5 text-[12px] ${FOCUS} ${on ? 'border-[#1F3A2F] bg-[#E7EDE9] text-[#1F3A2F]' : quiet}`}>
                        {on ? 'on' : 'off'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="rounded-lg border p-3 sm:p-4">
              <p className="font-medium">Last calls</p>
              {s.calls.length === 0 ? (
                <p className="mt-1 text-[12.5px] text-[#6E6E68]">Nothing yet.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {s.calls.map(c => (
                    <li key={c.id} className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
                      <span className="font-mono font-semibold">{c.tool}</span>
                      <span className="min-w-0 flex-1 text-[#6E6E68]">{c.summary ?? ''}</span>
                      <span className="text-[#9C9C95]">{when(c.created_at)}</span>
                      <span className={c.ok ? 'text-[#1F3A2F]' : 'text-[#8A3B2B]'}>{c.ok ? (c.kind === 'write' ? 'written' : 'read') : 'refused'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {msg && <p className="text-[12.5px] text-[#6E6E68]">{msg}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
