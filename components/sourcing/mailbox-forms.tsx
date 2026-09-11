'use client'

import { useState } from 'react'
import { FIELD, FIELD_LABEL } from '@/lib/desk-ui'
import { ActionButton, Note, useSourcing } from '@/components/sourcing/actions'
import type { MailboxRow } from '@/lib/sourcing/types'

const SMALL = 'inline-flex min-h-[34px] items-center justify-center gap-1.5 rounded-full border border-[#D2D1C7] bg-white px-3 text-[13px] font-semibold text-[#161613] hover:border-[#1F3A2F] disabled:opacity-50'
const SMALL_PRIMARY = 'inline-flex min-h-[34px] items-center justify-center gap-1.5 rounded-full bg-[#1F3A2F] px-3 text-[13px] font-semibold text-white hover:bg-[#142E24] disabled:opacity-50'

export function AddMailboxForm() {
  const { run, pending, note } = useSourcing()
  const [address, setAddress] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [signsAs, setSignsAs] = useState('')
  const [kind, setKind] = useState<'service_account' | 'refresh_token'>('service_account')
  const [refreshToken, setRefreshToken] = useState('')
  const [dailyCap, setDailyCap] = useState(10)
  const [reservedOther, setReservedOther] = useState(0)
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={e => {
        e.preventDefault()
        void run('mailbox.add', { address, displayName, signsAs, kind, refreshToken, dailyCap, reservedOther }, 'Added. Press Test to check the credential.')
      }}
    >
      <label>
        <span className={FIELD_LABEL}>Address</span>
        <input className={FIELD} value={address} onChange={e => setAddress(e.target.value)} placeholder="kim@getrefery.com" required />
      </label>
      <label>
        <span className={FIELD_LABEL}>Display name</span>
        <input className={FIELD} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Kim Lee" required />
      </label>
      <label>
        <span className={FIELD_LABEL}>Signs as</span>
        <input className={FIELD} value={signsAs} onChange={e => setSignsAs(e.target.value)} placeholder="Kim" />
      </label>
      <label>
        <span className={FIELD_LABEL}>Credential</span>
        <select className={FIELD} value={kind} onChange={e => setKind(e.target.value as 'service_account' | 'refresh_token')}>
          <option value="service_account">Domain-wide delegation (GOOGLE_SERVICE_ACCOUNT_JSON)</option>
          <option value="refresh_token">A refresh token from the Google connect flow</option>
        </select>
      </label>
      {kind === 'refresh_token' && (
        <label className="sm:col-span-2">
          <span className={FIELD_LABEL}>Refresh token</span>
          <input className={FIELD} value={refreshToken} onChange={e => setRefreshToken(e.target.value)} placeholder="1//0g..." />
        </label>
      )}
      <label>
        <span className={FIELD_LABEL}>Starting cap per day</span>
        <input type="number" min={1} max={100} className={FIELD} value={dailyCap} onChange={e => setDailyCap(Number(e.target.value))} />
      </label>
      <label>
        <span className={FIELD_LABEL}>Sends a day outside this desk (recaps, desk emails)</span>
        <input type="number" min={0} max={100} className={FIELD} value={reservedOther} onChange={e => setReservedOther(Number(e.target.value))} />
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending || !address.includes('@')} className={SMALL_PRIMARY}>
          Add mailbox
        </button>
        <Note text={note} />
      </div>
      <p className="text-[12.5px] leading-relaxed text-[#6E6E68] sm:col-span-2">
        An alias shares its account&apos;s allowance: enter the account, not the alias. The cap climbs by five every weekday to the ceiling. Google&apos;s own limit is 2,000; this desk never goes near it.
      </p>
    </form>
  )
}

export function MailboxRowActions({ m }: { m: MailboxRow }) {
  const { run, pending, note } = useSourcing()
  const [cap, setCap] = useState(m.daily_cap)
  const [ceiling, setCeiling] = useState(m.cap_ceiling)
  const [reserved, setReserved] = useState(m.reserved_other)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ActionButton op="mailbox.test" payload={{ mailboxId: m.id }} kind="small" describe="Credential works: {address}">
        Test
      </ActionButton>
      {m.status === 'active' ? (
        <ActionButton op="mailbox.update" payload={{ mailboxId: m.id, status: 'paused' }} kind="small">
          Pause
        </ActionButton>
      ) : (
        <ActionButton op="mailbox.update" payload={{ mailboxId: m.id, status: 'active' }} kind="small">
          Resume
        </ActionButton>
      )}
      <label className="inline-flex items-center gap-1 text-[12.5px] text-[#6E6E68]">
        start <input type="number" className={`${FIELD} mt-0 w-[64px] py-1 text-[12.5px]`} value={cap} onChange={e => setCap(Number(e.target.value))} />
      </label>
      <label className="inline-flex items-center gap-1 text-[12.5px] text-[#6E6E68]">
        ceiling <input type="number" className={`${FIELD} mt-0 w-[64px] py-1 text-[12.5px]`} value={ceiling} onChange={e => setCeiling(Number(e.target.value))} />
      </label>
      <label className="inline-flex items-center gap-1 text-[12.5px] text-[#6E6E68]">
        other <input type="number" className={`${FIELD} mt-0 w-[64px] py-1 text-[12.5px]`} value={reserved} onChange={e => setReserved(Number(e.target.value))} />
      </label>
      <button type="button" disabled={pending} className={SMALL} onClick={() => void run('mailbox.update', { mailboxId: m.id, daily_cap: cap, cap_ceiling: ceiling, reserved_other: reserved })}>
        Save caps
      </button>
      <Note text={note} />
    </div>
  )
}
