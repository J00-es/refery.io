import Link from 'next/link'
import { cn } from '@/lib/utils'

interface StageOverviewCardProps {
  href: string
  accentColor: string
  stageName: string
  count: number
  weeklyDelta: number
  staleCount?: number
  criticalCount?: number
  subText?: string
}

export function StageOverviewCard({
  href,
  accentColor,
  stageName,
  count,
  weeklyDelta,
  staleCount = 0,
  criticalCount = 0,
  subText,
}: StageOverviewCardProps) {
  return (
    <Link href={href}>
      <div className="bg-white border border-[rgba(16,15,15,0.10)] rounded-[10px] overflow-hidden cursor-pointer transition-all hover:border-[rgba(16,15,15,0.20)] hover:-translate-y-0.5">
        <div className="h-[3px]" style={{ backgroundColor: accentColor }} />
        <div className="px-[18px] py-4">
          <p className="text-xs text-[rgba(16,15,15,0.64)] font-medium tracking-wide mb-2">
            {stageName}
          </p>
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-serif text-[32px] font-normal leading-none tracking-tight text-[#100F0F]">
              {count}
            </span>
            {weeklyDelta !== 0 && (
              <span className={cn(
                'text-xs font-medium',
                weeklyDelta > 0 ? 'text-[#2A6B45]' : 'text-[#B23B3B]'
              )}>
                {weeklyDelta > 0 ? '+' : ''}{weeklyDelta} this wk
              </span>
            )}
            {weeklyDelta === 0 && (
              <span className="text-xs text-[rgba(16,15,15,0.40)]">
                no change
              </span>
            )}
          </div>
          {subText && (
            <p className="text-[11px] text-[rgba(16,15,15,0.40)] mt-1">{subText}</p>
          )}
          {criticalCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#B23B3B] bg-[#FDECEC] px-2 py-0.5 rounded-full mt-2">
              ! {criticalCount} stale ({'>'}14d)
            </span>
          )}
          {staleCount > 0 && criticalCount === 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#B7791F] bg-[#FBF3E1] px-2 py-0.5 rounded-full mt-2">
              ⚠ {staleCount} stale ({'>'}7d)
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
