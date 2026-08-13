'use client'

import { useEffect, useState } from 'react'
import { AgreementContent } from '@/components/agreement-content'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2 } from 'lucide-react'

/**
 * Shown once, the first time a partner on Partner Terms v2.0 submits a
 * candidate. These are the obligations that only exist once there is a
 * candidate, so this is the moment they bind.
 *
 * It appears in response to a 428 from the submission itself, and on accept it
 * retries what the partner was already doing. Nobody loses their upload.
 */
export function SubmissionTermsDialog({
  open,
  onAccepted,
  onCancel,
}: {
  open: boolean
  onAccepted: () => void
  onCancel: () => void
}) {
  const [content, setContent] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || content) return
    fetch('/api/partner/submission-terms', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.content && setContent(d.content))
      .catch(() => setError('Could not load the terms. Please try again.'))
  }, [open, content])

  if (!open) return null

  const accept = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/partner/submission-terms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accepted: true }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error || 'Could not record your acceptance. Please try again.')
        setSaving(false)
        return
      }
      onAccepted()
    } catch {
      setError('Network error. Please try again.')
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Submission terms"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
    >
      <div className="bg-background w-full sm:max-w-[560px] rounded-t-2xl sm:rounded-xl border shadow-lg max-h-[92vh] flex flex-col">
        <div className="px-5 sm:px-7 pt-6 pb-3">
          <h2 className="text-lg font-semibold">One thing before your first submission</h2>
          <p className="text-sm text-muted-foreground mt-1">
            About a minute. These apply to every candidate you submit from here.
          </p>
        </div>

        <div className="px-5 sm:px-7 overflow-y-auto flex-1 min-h-0">
          {content ? (
            <AgreementContent content={content} density="compact" showEyebrow={false} />
          ) : (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
              Loading the terms
            </div>
          )}
        </div>

        <div className="px-5 sm:px-7 py-4 border-t flex flex-col gap-3">
          <label className="flex items-start gap-2.5 text-sm cursor-pointer">
            <Checkbox
              checked={checked}
              onCheckedChange={(v) => setChecked(v === true)}
              disabled={!content}
              className="mt-0.5"
            />
            <span>I understand and agree.</span>
          </label>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onCancel} disabled={saving}>
              Not now
            </Button>
            <Button onClick={accept} disabled={!checked || saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Agree and submit
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
