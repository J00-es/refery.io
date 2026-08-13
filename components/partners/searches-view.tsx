'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  applyDeskQuery,
  deskQueryToParams,
  activeFilterCount,
  type DeskQuery,
  type DeskSearch,
} from '@/lib/desk-filters'
import { FilterBar } from './filter-bar'
import { SearchRow, SearchesEmpty } from './search-row'

/**
 * The searches list, filtered in the browser.
 *
 * The whole set arrives from the server already redacted, and filtering it here
 * rather than on the server is what makes the facet counts feel live — every
 * count updates on the same tick as the list, with no round trip to watch.
 *
 * The set is small by nature: a mandate is a signed agreement, so this is dozens
 * of rows and would be a few hundred at the business's most successful. If it ever
 * outgrows that, the same `applyDeskQuery` runs server-side unchanged — it is a
 * pure function over rows, which is why it lives in lib rather than here.
 *
 * The URL stays authoritative. Free text is debounced into it so typing does not
 * push a history entry per keystroke.
 */
export function SearchesView({
  searches,
  initialQuery,
}: {
  searches: DeskSearch[]
  initialQuery: DeskQuery
}) {
  const router = useRouter()
  const pathname = usePathname()

  /*
    Text is the one control that cannot be a link: it changes on every keystroke.
    So it is held here, debounced into the URL, and the URL remains the source of
    truth for everything else.
  */
  const [text, setText] = useState(initialQuery.q)
  useEffect(() => setText(initialQuery.q), [initialQuery.q])

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onQueryText = useCallback(
    (value: string) => {
      setText(value)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        const params = deskQueryToParams({ ...initialQuery, q: value.trim() })
        params.set('view', 'searches')
        router.replace(`${pathname}?${params.toString()}`, { scroll: false })
      }, 250)
    },
    [initialQuery, pathname, router],
  )
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  // Filter on the typed text immediately rather than waiting for the URL to catch
  // up, so the list never lags a keystroke behind the box.
  const query: DeskQuery = useMemo(() => ({ ...initialQuery, q: text.trim() }), [initialQuery, text])
  const result = useMemo(() => applyDeskQuery(searches, query), [searches, query])

  return (
    <div className="space-y-4">
      <FilterBar query={query} result={result} onQueryText={onQueryText} />

      {result.searches.length === 0 ? (
        <SearchesEmpty hasFilters={activeFilterCount(query) > 0} />
      ) : (
        <ul className="space-y-2.5">
          {result.searches.map(search => (
            <li key={search.jobId}>
              <SearchRow search={search} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
