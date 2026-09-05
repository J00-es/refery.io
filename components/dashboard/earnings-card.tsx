interface EarningsCardProps {
  label: string
  value: string
  suffix?: string
  subtitle: string
  isPositive?: boolean
}

export function EarningsCard({ label, value, suffix = 'k', subtitle, isPositive }: EarningsCardProps) {
  return (
    <div className="bg-white border border-[rgba(22,22,19,0.10)] rounded-[10px] px-4 sm:px-[22px] py-4 sm:py-5">
      <p className="text-[10px] sm:text-xs text-[rgba(22,22,19,0.40)] font-medium tracking-wide mb-1.5 sm:mb-2">
        {label}
      </p>
      <p className="text-[28px] sm:text-[38px] font-semibold leading-none tracking-tight text-[#161613] mb-1 sm:mb-1.5">
        {value}
        <span className="text-[#1F3A2F] font-medium">{suffix}</span>
      </p>
      <p className={`text-[10px] sm:text-xs ${isPositive ? 'text-[#1F3A2F] font-medium' : 'text-[rgba(22,22,19,0.64)]'}`}>
        {subtitle}
      </p>
    </div>
  )
}
