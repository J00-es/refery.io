import { cn } from '@/lib/utils'

interface FunnelStep {
  label: string
  value: number
  benchmark: number
}

interface FunnelBenchmarkProps {
  steps: FunnelStep[]
  insight?: string
  insightHighlight?: string
}

export function FunnelBenchmark({ steps, insight, insightHighlight }: FunnelBenchmarkProps) {
  return (
    <div className="bg-white border border-[rgba(22,22,19,0.10)] rounded-[10px] p-4 sm:p-6">
      {/* Mobile: horizontal scroll */}
      <div className="sm:hidden overflow-x-auto -mx-4 px-4">
        <div className="flex gap-4 min-w-max pb-2">
          {steps.map((step, idx) => {
            const diff = step.value - step.benchmark
            const isAbove = diff > 2
            const isBelow = diff < -2
            
            return (
              <div key={idx} className="min-w-[100px]">
                <p className="text-[10px] text-[rgba(22,22,19,0.64)] mb-1 whitespace-nowrap">{step.label}</p>
                <p
                  className={cn(
                    'text-[22px] font-semibold leading-none tracking-tight mb-1',
                    isAbove && 'text-[#1F3A2F]',
                    isBelow && 'text-[#B23B3B]',
                    !isAbove && !isBelow && 'text-[#161613]'
                  )}
                >
                  {step.value}%
                </p>
                <p className="text-[10px] text-[rgba(22,22,19,0.40)]">
                  avg {step.benchmark}%{' '}
                  {isAbove && <span className="text-[#1F3A2F] font-semibold">↑</span>}
                  {isBelow && <span className="text-[#B23B3B] font-semibold">↓</span>}
                </p>
              </div>
            )
          })}
        </div>
      </div>
      
      {/* Desktop: grid */}
      <div className="hidden sm:grid grid-cols-5 gap-3">
        {steps.map((step, idx) => {
          const diff = step.value - step.benchmark
          const isAbove = diff > 2
          const isBelow = diff < -2
          
          return (
            <div key={idx} className="px-1">
              <p className="text-[11.5px] text-[rgba(22,22,19,0.64)] mb-1.5">{step.label}</p>
              <p
                className={cn(
                  'text-[28px] font-semibold leading-none tracking-tight mb-1',
                  isAbove && 'text-[#1F3A2F]',
                  isBelow && 'text-[#B23B3B]',
                  !isAbove && !isBelow && 'text-[#161613]'
                )}
              >
                {step.value}%
              </p>
              <p className="text-[11px] text-[rgba(22,22,19,0.40)]">
                avg {step.benchmark}%{' '}
                {isAbove && <span className="text-[#1F3A2F] font-semibold">↑</span>}
                {isBelow && <span className="text-[#B23B3B] font-semibold">↓</span>}
              </p>
            </div>
          )
        })}
      </div>
      
      {insight && (
        <div className="mt-[18px] pt-4 border-t border-[rgba(22,22,19,0.06)] text-[13px] text-[rgba(22,22,19,0.64)]">
          {insightHighlight ? (
            <>
              <span className="text-[#B23B3B] font-semibold">{insightHighlight}</span> {insight}
            </>
          ) : (
            insight
          )}
        </div>
      )}
    </div>
  )
}
