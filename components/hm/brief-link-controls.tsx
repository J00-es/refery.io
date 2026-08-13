'use client'

/**
 * The controls for a company's hiring-manager brief link.
 *
 * Rotating deserves the friction it gets here: it is the only way to take a
 * link back, and it breaks the URL for everyone it was ever forwarded to,
 * including the founder who bookmarked it. So it confirms first and says
 * plainly what it costs.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Link2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Action = 'publish' | 'unpublish' | 'rotate'

export function CreateBriefButton({ companyId }: { companyId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function create() {
    setError(null)
    const res = await fetch('/api/hm-briefs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => null)
      setError(json?.error ?? 'Could not create the brief.')
      return
    }
    start(() => router.refresh())
  }

  return (
    <div>
      <Button size="sm" onClick={() => void create()} disabled={pending}>
        {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Link2 className="mr-1.5 h-3.5 w-3.5" />}
        Start a hiring manager brief
      </Button>
      {error && <p className="mt-2 text-[13px] text-destructive">{error}</p>}
    </div>
  )
}

export function BriefLinkControls({
  briefId,
  url,
  status,
}: {
  briefId: string
  url: string
  status: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busy, setBusy] = useState<Action | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmingRotate, setConfirmingRotate] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: Action) {
    setError(null)
    setBusy(action)
    const body =
      action === 'rotate'
        ? { rotate: true }
        : { status: action === 'publish' ? 'published' : 'draft' }

    const res = await fetch(`/api/hm-briefs/${briefId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setBusy(null)
    setConfirmingRotate(false)

    if (!res.ok) {
      const json = await res.json().catch(() => null)
      setError(json?.error ?? 'That did not work.')
      return
    }
    start(() => router.refresh())
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    } catch {
      setError('Could not reach the clipboard — copy it by hand.')
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border bg-muted/50 px-3 py-2 text-[13px]">
          {url}
        </code>
        <Button size="sm" variant="outline" onClick={() => void copy()}>
          {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {status === 'published' ? (
          <Button size="sm" variant="outline" onClick={() => void run('unpublish')} disabled={!!busy || pending}>
            {busy === 'unpublish' && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Unpublish
          </Button>
        ) : (
          <Button size="sm" onClick={() => void run('publish')} disabled={!!busy || pending}>
            {busy === 'publish' && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Publish
          </Button>
        )}

        {status === 'published' && (
          <Button asChild size="sm" variant="ghost">
            <a href={url} target="_blank" rel="noopener noreferrer">
              Open
            </a>
          </Button>
        )}

        {confirmingRotate ? (
          <>
            <Button size="sm" variant="destructive" onClick={() => void run('rotate')} disabled={!!busy}>
              {busy === 'rotate' && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Break the old link
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmingRotate(false)}>
              Keep it
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirmingRotate(true)} disabled={!!busy}>
            Rotate link
          </Button>
        )}
      </div>

      {confirmingRotate && (
        <p className="text-[13px] text-muted-foreground">
          A new URL is minted and this one stops working — for the founder&apos;s bookmark and anyone
          it was forwarded to. Comments and history are kept.
        </p>
      )}
      {error && <p className="text-[13px] text-destructive">{error}</p>}
    </div>
  )
}
