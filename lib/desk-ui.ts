/**
 * The partner desk's visual language.
 *
 * The first version of these pages put a bordered white card around every single
 * thing — company, role, stat, note, submission, form field — and set every label
 * in UPPERCASE 11px WITH LETTER-SPACING. Both were dashboard defaults five years
 * ago and both now read as chrome: the borders divide the page into boxes that
 * carry no meaning, and the shouty labels compete with the values they describe.
 *
 * Three rules replace them, and they are the only rules here:
 *
 *   1. Type carries hierarchy.   Size for importance, weight for kind. A label is
 *                                small and grey in sentence case; a value is
 *                                large and dark. No label is ever uppercase.
 *
 *   2. Colour carries meaning.   Forest is ours and actionable. Amber is "needs
 *                                you". Red is negative. Nothing is tinted to be
 *                                decorative — funding stages, departments and
 *                                industries are all neutral, because a colour per
 *                                category means colour tells you nothing.
 *
 *   3. Borders separate, space groups.  A card exists only where the whole thing
 *                                is one clickable object. Sections are divided by
 *                                whitespace, and by a single hairline rule where
 *                                a boundary genuinely needs stating.
 *
 * Tailwind needs finished class strings, so these are exported as complete class
 * names rather than raw values.
 */

// ── ink ─────────────────────────────────────────────────────────────────────
export const INK = 'text-[#161613]'
export const SOFT = 'text-[#5F5F58]'
export const MUTED = 'text-[#8A8A82]'
export const FOREST = 'text-[#1F3A2F]'

// ── rules and surfaces ──────────────────────────────────────────────────────
/** The one hairline. Used for rules between rows, not to box things in. */
export const RULE = 'border-[#E7E7E0]'

/**
 * A card, reserved for a whole object you can click. Note the near-invisible
 * border: separation comes from the white sitting on the paper canvas, and the
 * border only stops the two blurring together at the edges.
 */
export const CARD = 'rounded-[16px] bg-white border border-[#EAEAE3]'

/** The same object once it is interactive. Lift on hover, never on rest. */
export const CARD_LINK =
  'rounded-[16px] bg-white border border-[#EAEAE3] transition-[border-color,box-shadow] hover:border-[#D2D2C8] hover:shadow-[0_2px_12px_rgba(22,22,19,0.04)]'

/** A quiet region on the canvas — grouped by space, not boxed. */
export const WELL = 'rounded-[16px] bg-white/60'

export const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F3A2F]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[#F1F4F1]'

/** WCAG 2.2 target size. Every interactive element gets at least this. */
export const TAP = 'min-h-[44px]'

// ── type scale ──────────────────────────────────────────────────────────────
/** Page title. Serif, because these pages are read as documents. */
export const H1 =
  'text-[29px] font-semibold leading-[1.1] tracking-[-0.02em] text-[#161613] sm:text-[34px]'
/** Section heading. Sentence case, no rule under it — space does that job. */
export const H2 = 'text-[21px] font-semibold leading-tight text-[#161613]'
/** The name of one object in a list. */
export const H3 = 'text-[17px] font-semibold leading-snug text-[#161613]'

/**
 * A field label. Sentence case and small, sitting *under* its value where the
 * value is a number — you read the figure, then what it means.
 */
export const LABEL = 'text-[13px] font-normal text-[#8A8A82]'
/** A label that introduces a block above its content. Still sentence case. */
export const LEDE = 'text-[13.5px] leading-relaxed text-[#5F5F58]'
export const BODY = 'text-[14.5px] leading-relaxed text-[#3F3F3A]'
export const META = 'text-[12.5px] text-[#8A8A82]'

/** A figure. Serif and large so it reads before its label does. */
export const FIGURE = 'text-[26px] font-semibold leading-none tracking-[-0.02em] text-[#161613]'

// ── chips ───────────────────────────────────────────────────────────────────
/**
 * Neutral by default, and there should be at most three of them.
 *
 * The role header used to carry seven — location, remote policy, seniority,
 * salary, experience, visa, department — all in identical grey, which is a list
 * pretending to be a hierarchy. Anything past the third fact belongs in the
 * detail line as plain text.
 */
export const CHIP =
  'inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full bg-[#F2F2EC] px-2.5 py-1 text-[12px] font-medium leading-none text-[#5F5F58]'

/** The one chip allowed to be forest: what this is worth to the reader. */
export const CHIP_VALUE =
  'inline-flex items-center gap-1.5 rounded-full bg-[#E7EFEA] px-2.5 py-1 text-[12px] font-semibold leading-none text-[#1F3A2F]'

/** Needs attention. Amber, and only ever for something the reader must act on. */
export const CHIP_WARN =
  'inline-flex items-center gap-1.5 rounded-full bg-[#F7F0DE] px-2.5 py-1 text-[12px] font-semibold leading-none text-[#7E621C]'

export const CHIP_BAD =
  'inline-flex items-center gap-1.5 rounded-full bg-[#F9EBE9] px-2.5 py-1 text-[12px] font-semibold leading-none text-[#9C3F37]'

// ── buttons ─────────────────────────────────────────────────────────────────
export const BTN_PRIMARY = `inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-[#1F3A2F] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-[#142E24] disabled:opacity-50 ${FOCUS}`
export const BTN_QUIET = `inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-[#D2D1C7] px-4 text-[14px] font-semibold text-[#161613] transition-colors hover:border-[#1F3A2F] hover:text-[#1F3A2F] ${FOCUS}`
export const BTN_TEXT = `inline-flex min-h-[38px] items-center gap-1.5 text-[13.5px] font-semibold text-[#1F3A2F] transition-colors hover:text-[#142E24] ${FOCUS}`

// ── forms ───────────────────────────────────────────────────────────────────
export const FIELD_LABEL = 'block text-[13px] font-medium text-[#3F3F3A]'
export const FIELD = `mt-1.5 w-full rounded-[12px] border border-[#E0E0D7] bg-white px-3 py-2.5 text-[14.5px] text-[#161613] placeholder:text-[#B4B4AA] ${FOCUS}`

/**
 * Joins detail fragments with a middot, dropping empties.
 *
 * Most of what used to be a chip is a fact that only needs to be legible, not
 * framed — "San Francisco · On-site · Senior · $180k". One line, one colour, read
 * in a glance.
 */
export function detailLine(...parts: (string | null | undefined | false)[]): string {
  return parts.filter(Boolean).join(' · ')
}
