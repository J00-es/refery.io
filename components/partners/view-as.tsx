'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, Loader2, Search } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { FOCUS, META, MUTED } from '@/lib/desk-ui'

interface UserOption {
  user_id: string
  email: string
  full_name: string | null
  role: string
}

/**
 * Look at the desk as one of your scouts.
 *
 * The desk shows a scout something quite different from what it shows an admin —
 * anonymised clients, only their own candidates, only their own submissions — and
 * there is no way to check that by reasoning about it. Especially now: the desk is
 * super-admin-only while it is being built, so this is currently the *only* way to
 * see the scout experience at all.
 *
 * Read-only, enforced server-side rather than by hiding buttons. See
 * `previewBlocked`.
 */
export function ViewAs() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [users, setUsers] = useState<UserOption[] | null>(null)
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || users !== null) return
    fetch('/api/partners/users')
      .then(r => r.json())
      .then(body => setUsers(body.users ?? []))
      .catch(() => setError('Could not load the team list.'))
  }, [open, users])

  async function start(userId: string) {
    setBusy(userId)
    setError(null)
    try {
      const res = await fetch('/api/partners/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'Could not start the preview.')
        return
      }
      setOpen(false)
      // The persona is resolved server-side from a cookie, so the whole tree has
      // to re-render — refresh rather than a client-side state change.
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  const needle = filter.trim().toLowerCase()
  const shown = (users ?? []).filter(
    u =>
      !needle ||
      (u.full_name ?? '').toLowerCase().includes(needle) ||
      u.email.toLowerCase().includes(needle),
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex min-h-[36px] items-center gap-2 rounded-full border border-[#D2D1C7] bg-white px-3.5 text-[13px] font-semibold text-[#161613] transition-colors hover:border-[#1F3A2F] hover:text-[#1F3A2F] hover:text-[#161613] ${FOCUS}`}
        >
          <Eye className="h-3.5 w-3.5" />
          View as a partner
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[300px] p-0">
        <div className="border-b border-[#E4E3DC] p-3">
          <p className="text-[13px] font-semibold text-[#161613]">See the desk as they see it</p>
          <p className={`mt-0.5 ${META}`}>
            Their assignments, their candidates, their submissions. Read-only.
          </p>
          <div className="relative mt-2.5">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#B4B4AA]"
              aria-hidden
            />
            <input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Find a scout or recruiter"
              className={`h-[34px] w-full rounded-full border border-[#E0E0D7] pl-8 pr-2.5 text-[13px] ${FOCUS}`}
            />
          </div>
        </div>

        <div className="max-h-[280px] overflow-y-auto p-1.5">
          {error && <p className="px-2 py-2 text-[12.5px] text-[#9C3F37]">{error}</p>}
          {users === null ? (
            <p className={`flex items-center gap-2 px-2 py-3 ${META}`}>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading…
            </p>
          ) : shown.length === 0 ? (
            <p className={`px-2 py-3 ${META}`}>Nobody matches that.</p>
          ) : (
            shown.map(user => (
              <button
                key={user.user_id}
                type="button"
                disabled={busy !== null}
                onClick={() => start(user.user_id)}
                className={`flex w-full min-h-[44px] items-center gap-2 rounded-[10px] px-2.5 py-2 text-left transition-colors hover:bg-[#F2F2EC] disabled:opacity-50 ${FOCUS}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-[#161613]">
                    {user.full_name || user.email}
                  </span>
                  <span className={`block truncate ${META}`}>
                    {user.role.replace(/_/g, ' ')} · {user.email}
                  </span>
                </span>
                {busy === user.user_id && (
                  <Loader2 className={`h-3.5 w-3.5 shrink-0 animate-spin ${MUTED}`} />
                )}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
