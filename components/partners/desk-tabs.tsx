import Link from 'next/link'
import { FOCUS } from '@/lib/candidate-ui'

export type DeskView = 'all' | 'mine' | 'setup'

/**
 * Disjoint, exhaustive, and named after what is in them.
 *
 * "Mine" is the clients you can actually act on today; "All" adds the ones you
 * would have to ask about first. The setup tab is admin-only and is a to-do
 * list, not a filter — it holds relationships a scout cannot yet do anything
 * with, so it says so in the label.
 */
export function DeskTabs({
  view,
  counts,
  canManage,
}: {
  view: DeskView
  counts: Record<DeskView, number>
  canManage: boolean
}) {
  const tabs: { key: DeskView; label: string }[] = [
    { key: 'all', label: 'All clients' },
    { key: 'mine', label: canManage ? 'Assigned to me' : 'Open to me' },
    ...(canManage ? ([{ key: 'setup' as DeskView, label: 'Needs setup' }]) : []),
  ]

  return (
    <nav
      aria-label="Client filter"
      className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map(tab => {
        const active = tab.key === view
        return (
          <Link
            key={tab.key}
            href={tab.key === 'all' ? '/partners' : `/partners?view=${tab.key}`}
            aria-current={active ? 'page' : undefined}
            className={`inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13.5px] font-medium transition-colors ${FOCUS} ${
              active
                ? 'border-[#1F4D3A] bg-[#1F4D3A] text-white'
                : 'border-[#ECECE6] bg-white text-[#6E6E68] hover:border-[#D8D8D0] hover:text-[#161613]'
            }`}
          >
            {tab.label}
            <span className={active ? 'text-white/70' : 'text-[#9C9C95]'}>{counts[tab.key]}</span>
          </Link>
        )
      })}
    </nav>
  )
}
