/**
 * Shared visual language for the candidate surfaces.
 *
 * These tokens mirror the scout dashboard (paper canvas, forest accent, serif
 * display) so the two pages read as one product. They were previously
 * copy-pasted hex literals inside the dashboard page; anything new should
 * import from here rather than re-typing them.
 *
 * Tailwind needs class names as complete literals, so these are exported as
 * finished class strings rather than raw hex values.
 */
export const INK = 'text-[#161613]'
export const MUTED = 'text-[#6E6E68]'
export const FAINT = 'text-[#9C9C95]'
export const LINE = 'border-[#ECECE6]'
export const LINE_STRONG = 'border-[#D8D8D0]'
export const FOREST = 'text-[#1F4D3A]'
export const FOREST_BG = 'bg-[#E9F0EC]'

/** Focus ring used on every interactive element on these pages. */
export const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3A]/40 focus-visible:ring-offset-1'

/** Card shell: white on the paper canvas, hairline border, 18px radius. */
export const CARD = 'bg-white border border-[#ECECE6] rounded-[18px]'

/**
 * Neutral chip. Status is carried by a small colored dot inside the chip
 * rather than by tinting the whole chip — with eight-plus signals on a card,
 * full-color pills compete with each other and nothing reads as important.
 */
export const CHIP =
  'inline-flex items-center gap-1.5 rounded-full border border-[#ECECE6] bg-[#FAFAF6] px-2.5 py-1 text-[11.5px] font-medium text-[#6E6E68] leading-none'

/** Minimum comfortable touch target (WCAG 2.2 target-size guidance). */
export const TAP = 'min-h-[44px]'

// ── availability ────────────────────────────────────────────────────────────
export type AvailabilityKey = 'active' | 'off_market' | 'not_yet_talked' | 'not_qualified'

export const AVAILABILITY: Record<
  AvailabilityKey,
  { label: string; short: string; dot: string; order: number }
> = {
  not_yet_talked: { label: 'Not yet talked', short: 'To reach', dot: 'bg-[#C79A2E]', order: 1 },
  active: { label: 'Actively looking', short: 'Active', dot: 'bg-[#2E9E6B]', order: 2 },
  off_market: { label: 'Off market', short: 'Off market', dot: 'bg-[#B8B8B0]', order: 3 },
  not_qualified: { label: 'Not qualified', short: 'Not a fit', dot: 'bg-[#C2544B]', order: 4 },
}

export function availabilityOf(status?: string | null) {
  return AVAILABILITY[(status as AvailabilityKey) ?? 'not_yet_talked'] ?? AVAILABILITY.not_yet_talked
}

// ── pipeline stage → dot color ──────────────────────────────────────────────
const STAGE_DOTS: Record<string, string> = {
  auto_matched: 'bg-[#B8B8B0]',
  screening: 'bg-[#7C93A8]',
  job_matched: 'bg-[#7C93A8]',
  job_shared: 'bg-[#5E8BA8]',
  interest_confirmed: 'bg-[#3F8F73]',
  hm_shared: 'bg-[#1F4D3A]',
  hm_pending: 'bg-[#C79A2E]',
  auto_passed: 'bg-[#C9C9C1]',
  rejected: 'bg-[#C2544B]',
}

export function stageDot(stage: string): string {
  return STAGE_DOTS[stage] ?? 'bg-[#B8B8B0]'
}

export function stageLabel(stage: string): string {
  return stage.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ── verdicts, rendered as grades ────────────────────────────────────────────
/**
 * On a list card a verdict only needs to answer "how good, at a glance".
 * Spelling it out ("Very strong") costs a chip's width and reads as prose in a
 * grid, so the card shows the grade and the detail page keeps the full wording.
 */
export const VERDICT_GRADES: Record<string, { grade: string; label: string; className: string }> = {
  very_strong: {
    grade: 'A+',
    label: 'Very strong',
    className: 'bg-[#1F4D3A] text-white border-transparent',
  },
  strong: {
    grade: 'A',
    label: 'Strong',
    className: 'bg-[#E9F0EC] text-[#1F4D3A] border-[#1F4D3A]/20',
  },
  moderate: {
    grade: 'A−',
    label: 'Moderate',
    className: 'bg-[#F3F1E6] text-[#6E6A2E] border-[#6E6A2E]/20',
  },
  weak: {
    grade: 'B+',
    label: 'Weak',
    className: 'bg-[#F5EEDD] text-[#8A6A1F] border-[#8A6A1F]/20',
  },
  pass: {
    grade: 'Pass',
    label: 'Pass',
    className: 'bg-[#F7EDEC] text-[#9C4038] border-[#9C4038]/20',
  },
}

/** Shown when nobody has graded the candidate yet. */
export const UNGRADED = {
  grade: '—',
  label: 'Not yet calibrated',
  className: 'bg-transparent text-[#9C9C95] border-dashed border-[#D8D8D0]',
}

export const GRADE_BADGE =
  'inline-flex h-[26px] min-w-[34px] items-center justify-center rounded-lg border px-1.5 text-[12.5px] font-semibold leading-none tabular-nums'

// ── avatars ─────────────────────────────────────────────────────────────────
/**
 * Five low-chroma tints that sit comfortably on the paper canvas. A single
 * flat avatar color would make a grid of cards uniform and hard to scan; fully
 * saturated colors would fight the forest accent. Assignment is deterministic
 * from the name so a person keeps the same tint everywhere.
 */
const AVATAR_TINTS = [
  'bg-[#E9F0EC] text-[#1F4D3A]',
  'bg-[#EDEDE6] text-[#5A5A52]',
  'bg-[#F0EAE2] text-[#7A6250]',
  'bg-[#E7EDF2] text-[#3F5A70]',
  'bg-[#F2E9EC] text-[#78515C]',
]

export function avatarTint(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_TINTS[hash % AVATAR_TINTS.length]
}

export function initialsOf(name: string | null | undefined): string {
  if (!name) return '?'
  return (
    name
      .trim()
      .split(/\s+/)
      .map(p => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  )
}

// ── formatting ──────────────────────────────────────────────────────────────
export function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}h ago`
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay === 1) return 'Yesterday'
  if (diffDay < 7) return `${diffDay}d ago`
  const diffWeek = Math.floor(diffDay / 7)
  if (diffWeek < 5) return `${diffWeek}w ago`
  const diffMonth = Math.floor(diffDay / 30)
  if (diffMonth < 12) return `${diffMonth}mo ago`
  return `${Math.floor(diffMonth / 12)}y ago`
}

export function formatSalary(min?: number | null, max?: number | null): string | null {
  const k = (n: number) => `$${Math.round(n / 1000)}k`
  if (min && max) return `${k(min)}–${k(max)}`
  if (min) return `${k(min)}+`
  if (max) return `Up to ${k(max)}`
  return null
}

/** Owner display name, falling back to the local part of their email. */
export function ownerName(owner?: { email: string; full_name: string | null } | null): string | null {
  if (!owner) return null
  return owner.full_name?.trim() || owner.email?.split('@')[0] || null
}
