import { cn } from '@/lib/utils'

interface DaysInStageBadgeProps {
  days: number
  className?: string
}

export function DaysInStageBadge({ days, className }: DaysInStageBadgeProps) {
  const isCritical = days > 14
  const isStale = days > 7

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-semibold whitespace-nowrap',
        isCritical && 'bg-[#FDECEC] text-[#B23B3B]',
        isStale && !isCritical && 'bg-[#FBF3E1] text-[#B7791F]',
        !isStale && 'bg-[#EAE9E1] text-[rgba(16,15,15,0.64)]',
        className
      )}
    >
      {days}d
      {(isCritical || isStale) && (
        <span
          className={cn(
            'text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/60',
            isCritical ? 'text-[#B23B3B]' : 'text-[#B7791F]'
          )}
        >
          {isCritical ? 'Critical' : 'Stale'}
        </span>
      )}
    </span>
  )
}
