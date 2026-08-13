import Link from 'next/link'
import { FOCUS } from '@/lib/desk-ui'

export type DeskViewKind = 'searches' | 'clients'

/**
 * Searches or clients.
 *
 * These are two genuinely different questions and the desk answers only one of
 * them well at a time. "Where can I earn tonight" is a role question — flat,
 * filterable, sorted by payout. "What is this client and what is the bar" is a
 * company question — grouped, with the brief and the engagement note.
 *
 * Searches is the default because it is the working surface. The desk was
 * company-first for its whole first version, which meant every visit started by
 * asking a scout to browse an org chart before finding work.
 */
export function ViewSwitch({
  view,
  searchCount,
  clientCount,
}: {
  view: DeskViewKind
  searchCount: number
  clientCount: number
}) {
  const tabs: { key: DeskViewKind; label: string; count: number }[] = [
    { key: 'searches', label: 'Live searches', count: searchCount },
    { key: 'clients', label: 'Clients', count: clientCount },
  ]

  return (
    <nav aria-label="Desk view" className="flex gap-5">
      {tabs.map(tab => {
        const active = tab.key === view
        return (
          <Link
            key={tab.key}
            href={tab.key === 'searches' ? '/partners' : '/partners?view=clients'}
            aria-current={active ? 'page' : undefined}
            /* An underline rather than a pill: this is a change of surface, not a
               filter, and the filter rail below already uses pills. */
            className={`-mb-px border-b-2 pb-2.5 text-[15px] font-medium transition-colors ${FOCUS} ${
              active
                ? 'border-[#1F4D3A] text-[#161613]'
                : 'border-transparent text-[#8A8A82] hover:text-[#161613]'
            }`}
          >
            {tab.label}
            <span className={active ? 'ml-2 text-[#8A8A82]' : 'ml-2 text-[#B4B4AA]'}>{tab.count}</span>
          </Link>
        )
      })}
    </nav>
  )
}
