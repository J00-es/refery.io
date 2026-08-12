import { CARD } from '@/lib/candidate-ui'
import { submissionStatus, type PartnerCompanyView } from '@/lib/partners'

/**
 * Four numbers, and only numbers this viewer can act on.
 *
 * A scout's third and fourth tiles count their own submissions; an admin's count
 * the desk's. Showing a scout the network-wide submission volume would tell them
 * how busy other partners are and nothing about their own work, which is the
 * mistake the jobs board had to be walked back from.
 */
export function DeskStats({
  companies,
  roles,
  submissions,
  showsAllSubmissions,
}: {
  companies: PartnerCompanyView[]
  roles: number
  submissions: { status: string }[]
  showsAllSubmissions: boolean
}) {
  const inPlay = submissions.filter(s => submissionStatus(s.status).category === 'in_progress').length
  const placed = submissions.filter(s => s.status === 'placed').length
  const openTo = companies.filter(c => c.unlocked).length

  const tiles = [
    { value: companies.length, label: 'Partner companies' },
    { value: roles, label: 'Live searches' },
    {
      value: inPlay,
      label: showsAllSubmissions ? 'Submissions in play' : 'Yours in play',
    },
    {
      value: placed,
      label: showsAllSubmissions ? 'Placed' : 'Your placements',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map(tile => (
        <div key={tile.label} className={`px-4 py-3.5 ${CARD}`}>
          <p className="font-serif text-[24px] leading-none tracking-[-0.02em] text-[#161613]">
            {tile.value}
          </p>
          <p className="mt-2 text-[11.5px] font-medium uppercase tracking-[0.07em] text-[#6E6E68]">
            {tile.label}
          </p>
        </div>
      ))}
      {!showsAllSubmissions && openTo === 0 && (
        <p className="col-span-2 text-[12.5px] leading-relaxed text-[#9C9C95] sm:col-span-4">
          You have no client assignments yet, so every card below is anonymised.
        </p>
      )}
    </div>
  )
}
