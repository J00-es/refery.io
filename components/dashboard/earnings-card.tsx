interface EarningsCardProps {
  label: string
  value: string
  suffix?: string
  subtitle: string
  isPositive?: boolean
}

export function EarningsCard({ label, value, suffix = 'k', subtitle, isPositive }: EarningsCardProps) {
  return (
    <div className="bg-white border border-[rgba(16,15,15,0.10)] rounded-[10px] px-[22px] py-5">
      <p className="text-xs text-[rgba(16,15,15,0.40)] font-medium tracking-wide mb-2">
        {label}
      </p>
      <p className="font-serif text-[38px] font-normal leading-none tracking-tight text-[#100F0F] mb-1.5">
        {value}
        <em className="text-[#2A6B45] italic">{suffix}</em>
      </p>
      <p className={`text-xs ${isPositive ? 'text-[#2A6B45] font-medium' : 'text-[rgba(16,15,15,0.64)]'}`}>
        {subtitle}
      </p>
    </div>
  )
}
