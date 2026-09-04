// Mirrors the real page's shape (header / tabs / toolbar / card grid) in the
// paper palette. The previous skeleton used the default Skeleton token, which
// rendered as saturated green blocks and read as a broken page rather than a
// loading one.
const BAR = 'animate-pulse rounded-full bg-[#EFEFE9]'
const CARD_CLS = 'rounded-[18px] border border-[#E4E3DC] bg-white p-4 sm:p-5'

export default function CandidatesLoading() {
  return (
    <div className="mx-auto max-w-[1120px] space-y-6 px-1 pb-16 sm:px-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <div className={`${BAR} h-9 w-52`} />
          <div className={`${BAR} h-4 w-72`} />
        </div>
        <div className="flex gap-2.5">
          <div className={`${BAR} h-11 w-32`} />
          <div className={`${BAR} h-11 w-36`} />
        </div>
      </div>

      <div className="flex gap-5 border-b border-[#E4E3DC] pb-3">
        {[56, 48, 72, 76, 64].map((w, i) => (
          <div key={i} className={`${BAR} h-4`} style={{ width: w }} />
        ))}
      </div>

      <div className="flex flex-col gap-2.5 sm:flex-row">
        <div className={`${BAR} h-10 flex-1`} />
        <div className="flex gap-2">
          <div className={`${BAR} h-10 w-32`} />
          <div className={`${BAR} h-10 w-24`} />
          <div className={`${BAR} h-10 w-36`} />
        </div>
      </div>

      <div className="grid auto-rows-fr gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,21rem),1fr))]">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={CARD_CLS}>
            <div className="flex items-start gap-3">
              <div className={`${BAR} h-11 w-11 shrink-0`} />
              <div className="min-w-0 flex-1 space-y-2">
                <div className={`${BAR} h-4 w-2/3`} />
                <div className={`${BAR} h-3.5 w-5/6`} />
                <div className={`${BAR} h-3 w-1/3`} />
              </div>
              <div className={`${BAR} h-[26px] w-9 shrink-0 rounded-lg`} />
            </div>
            <div className="mt-4 space-y-3">
              <div className={`${BAR} h-3.5 w-1/2`} />
              <div className="flex gap-1.5">
                <div className={`${BAR} h-6 w-20`} />
                <div className={`${BAR} h-6 w-24`} />
                <div className={`${BAR} h-6 w-16`} />
              </div>
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-[#E4E3DC] pt-3">
              <div className={`${BAR} h-4 w-28`} />
              <div className={`${BAR} h-3 w-14`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
