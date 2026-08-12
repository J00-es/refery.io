'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Command, Briefcase, FileText, Inbox } from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { FOCUS, META } from '@/lib/desk-ui'

/**
 * ⌘K over the whole desk.
 *
 * The benchmark for this product is a sidebar with eighteen destinations, where a
 * recruiter has to learn an org chart before they can put a candidate forward.
 * The answer is not a better sidebar — it is not needing one. There are only two
 * kinds of thing on this desk, clients and searches, so one keystroke that jumps
 * straight to any of them replaces navigation entirely.
 *
 * Everything here is already on the page that rendered it, so the palette costs
 * no extra queries and works offline of the network entirely.
 */

export interface PaletteTarget {
  kind: 'company' | 'role'
  id: string
  href: string
  label: string
  detail: string | null
  /** True where the viewer cannot see the client by name. */
  locked?: boolean
}

export function DeskPalette({
  targets,
  hasRequests,
}: {
  targets: PaletteTarget[]
  hasRequests: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      // Both modifiers, because half this network is on Windows.
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen(o => !o)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  function go(href: string) {
    setOpen(false)
    router.push(href)
  }

  const companies = targets.filter(t => t.kind === 'company')
  const roles = targets.filter(t => t.kind === 'role')

  return (
    <>
      {/* A visible affordance as well as the shortcut: a keyboard-only feature is
          a feature only its author knows about. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex min-h-[36px] items-center gap-2 rounded-full border border-[#E0E0D7] bg-white/70 px-3 text-[13px] text-[#8A8A82] transition-colors hover:border-[#D2D2C8] hover:text-[#161613] ${FOCUS}`}
      >
        <Command className="h-3.5 w-3.5" />
        Jump to a client or search
        <kbd className={`ml-1 rounded border border-[#E7E7E0] px-1.5 py-0.5 font-sans text-[11px] ${META}`}>
          ⌘K
        </kbd>
      </button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Jump to"
        description="Search clients and live searches"
      >
        <CommandInput placeholder="Search clients and live searches…" />
        <CommandList>
          <CommandEmpty>Nothing matches that.</CommandEmpty>

          {companies.length > 0 && (
            <CommandGroup heading="Clients">
              {companies.map(target => (
                <CommandItem
                  key={target.id}
                  value={`${target.label} ${target.detail ?? ''}`}
                  onSelect={() => go(target.href)}
                >
                  <Building2 className="h-4 w-4 text-[#8A8A82]" />
                  <span className="flex-1 truncate">{target.label}</span>
                  {target.detail && (
                    <span className="shrink-0 text-[12px] text-[#8A8A82]">{target.detail}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {roles.length > 0 && (
            <CommandGroup heading="Live searches">
              {roles.map(target => (
                <CommandItem
                  key={target.id}
                  value={`${target.label} ${target.detail ?? ''}`}
                  onSelect={() => go(target.href)}
                >
                  <Briefcase className="h-4 w-4 text-[#8A8A82]" />
                  <span className="flex-1 truncate">{target.label}</span>
                  {target.detail && (
                    <span className="shrink-0 text-[12px] text-[#8A8A82]">{target.detail}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          <CommandGroup heading="Go to">
            <CommandItem value="all clients desk partners" onSelect={() => go('/partners')}>
              <FileText className="h-4 w-4 text-[#8A8A82]" />
              All clients
            </CommandItem>
            {hasRequests && (
              <CommandItem value="access requests" onSelect={() => go('/partners/requests')}>
                <Inbox className="h-4 w-4 text-[#8A8A82]" />
                Access requests
              </CommandItem>
            )}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  )
}
