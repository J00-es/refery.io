/**
 * The vocabulary of the candidate self-submission form, shared by the form,
 * the private profile page and the server that writes the answers onto the
 * candidate row. One list per question, so an answer is stored the same way
 * from every door. No server imports here: the form ships this to the browser.
 */

export const LOOKING = [
  { key: 'looking', label: 'Actively looking' },
  { key: 'open', label: 'Open to the right thing' },
  { key: 'later', label: 'Not now, keep me for later' },
] as const
export type Looking = (typeof LOOKING)[number]['key']

export const LOCATIONS = ['SF Bay Area', 'New York', 'Other US hub', 'Remote, US', 'UK or Europe', 'Elsewhere'] as const
export type Location = (typeof LOCATIONS)[number]
export const US_LOCATIONS: Location[] = ['SF Bay Area', 'New York', 'Other US hub', 'Remote, US']
export const CORE_LOCATIONS: Location[] = ['SF Bay Area', 'New York']
/** Chips that open a text field for the actual places. */
export const TYPED_LOCATIONS: Partial<Record<Location, string>> = {
  'Other US hub': 'Which cities? Austin, Seattle, Boston…',
  'UK or Europe': 'Which cities? London, Berlin, Paris…',
  Elsewhere: 'Which cities or countries?',
}
export const LOCATION_NOTE =
  'Most of our searches are on-site in SF or New York, so matching you may take longer. You will only hear from us when something truly fits.'

export const RELOCATION = [
  { key: 'yes', label: 'Yes' },
  { key: 'no', label: 'No' },
  { key: 'depends', label: 'Depends' },
] as const

export const SETTINGS = [
  { key: 'onsite', label: 'On-site is fine' },
  { key: 'hybrid', label: 'Hybrid' },
  { key: 'remote', label: 'Remote only' },
] as const
export const SETTING_NOTE =
  'Most of our searches ask for on-site. Hybrid or remote only means fewer matches and a longer wait; we will reach out only when one fits.'

/** The same five answers the upload step and the profile use. */
export const WORK_AUTH_US = ['US citizen or green card', 'H-1B, transfer needed', 'OPT or STEM OPT', 'Needs new sponsorship', 'Not US based, no US visa'] as const
export const WORK_AUTH_UK_EU = [
  'UK: citizen or settled status',
  'UK: Skilled Worker visa, transfer needed',
  'UK: Graduate or other time-limited visa',
  'EU: citizen or permanent residence',
  'EU: work permit tied to an employer',
  'Need sponsorship for the UK or EU',
] as const

export type Currency = 'USD' | 'GBP' | 'EUR'
export interface BaseBand {
  label: string
  min: number
  max: number
}
/**
 * Bands per market. US bands follow the upload step, extended at the top as
 * Lily asked. UK and Europe bands follow 2026 senior-engineer base ranges at
 * startups (London roughly £90k to £140k, Berlin and Amsterdam €88k to €118k,
 * Paris €75k to €95k), so the bands sit where the answers actually fall.
 */
export const BASE_BANDS: Record<Currency, BaseBand[]> = {
  USD: [
    { label: 'Under $120k', min: 90_000, max: 120_000 },
    { label: '$120 to 160k', min: 120_000, max: 160_000 },
    { label: '$160 to 200k', min: 160_000, max: 200_000 },
    { label: '$200 to 250k', min: 200_000, max: 250_000 },
    { label: '$250 to 300k', min: 250_000, max: 300_000 },
    { label: '$300k+', min: 300_000, max: 400_000 },
  ],
  GBP: [
    { label: 'Under £60k', min: 45_000, max: 60_000 },
    { label: '£60 to 80k', min: 60_000, max: 80_000 },
    { label: '£80 to 100k', min: 80_000, max: 100_000 },
    { label: '£100 to 130k', min: 100_000, max: 130_000 },
    { label: '£130 to 160k', min: 130_000, max: 160_000 },
    { label: '£160k+', min: 160_000, max: 220_000 },
  ],
  EUR: [
    { label: 'Under €60k', min: 45_000, max: 60_000 },
    { label: '€60 to 80k', min: 60_000, max: 80_000 },
    { label: '€80 to 100k', min: 80_000, max: 100_000 },
    { label: '€100 to 125k', min: 100_000, max: 125_000 },
    { label: '€125 to 150k', min: 125_000, max: 150_000 },
    { label: '€150k+', min: 150_000, max: 200_000 },
  ],
}
export const CURRENCY_SYMBOL: Record<Currency, string> = { USD: '$', GBP: '£', EUR: '€' }

export const START = [
  { key: 'now', label: 'Now' },
  { key: 'month', label: 'In a month' },
  { key: 'quarter', label: 'Three months or more' },
] as const

export const STAGES = ['Seed', 'Series A', 'Series B', 'Later'] as const

export const FUNCTIONS = ['Engineering', 'GTM and Sales', 'Product', 'Design', 'Operations and Finance', 'Other'] as const
export type FunctionKey = (typeof FUNCTIONS)[number]
/** Sub-roles, shown once the function is picked. "Other" on either list opens a text field. */
export const ROLES: Partial<Record<FunctionKey, readonly string[]>> = {
  Engineering: ['Founding Engineer', 'AI / ML', 'Applied AI or Research', 'Full-Stack', 'Backend', 'DevOps or Deployment', 'Forward-Deployed Engineer', 'Other'],
  'GTM and Sales': ['Founding GTM', 'Founding AE', 'Technical B2B or Enterprise Sales', 'Account Manager', 'Other'],
}

export const CONSENT_VERSION = '2026-09-09'
export const CONSENT_TEXT =
  'Keep my profile for matching for 24 months. Share it with a company only after I say yes to that role. I can pause or delete it any time.'
export const RETENTION_MONTHS = 24

export interface BaseAnswer {
  currency: Currency | 'OTHER'
  band: string | null
  /** For OTHER, or when the person typed an amount. */
  amount: number | null
  note: string | null
}

/** Everything the person tells us beyond the CV. Validated by `validateAnswers`. */
export interface ApplyAnswers {
  fullName: string
  email: string
  linkedin: string
  currentLocation: string
  looking: Looking | null
  locations: Location[]
  cities: Partial<Record<Location, string>>
  relocation: 'yes' | 'no' | 'depends' | null
  setting: 'onsite' | 'hybrid' | 'remote' | null
  workAuthUs: string | null
  workAuthUkEu: string[]
  workAuthOther: string
  bases: BaseAnswer[]
  currentBase: number | null
  startBy: 'now' | 'month' | 'quarter' | null
  stages: string[]
  functions: string[]
  roles: string[]
  rolesOther: string
  neverCompanies: string
  notes: string
  consent: boolean
}

export const EMPTY_ANSWERS: ApplyAnswers = {
  fullName: '',
  email: '',
  linkedin: '',
  currentLocation: '',
  looking: null,
  locations: [],
  cities: {},
  relocation: null,
  setting: null,
  workAuthUs: null,
  workAuthUkEu: [],
  workAuthOther: '',
  bases: [],
  currentBase: null,
  startBy: null,
  stages: [],
  functions: [],
  roles: [],
  rolesOther: '',
  neverCompanies: '',
  notes: '',
  consent: false,
}

export const asksUsAuth = (a: Pick<ApplyAnswers, 'locations'>) => a.locations.some(l => US_LOCATIONS.includes(l))
export const asksUkEuAuth = (a: Pick<ApplyAnswers, 'locations'>) => a.locations.includes('UK or Europe')
export const asksOtherAuth = (a: Pick<ApplyAnswers, 'locations'>) => a.locations.includes('Elsewhere')
export const outsideCore = (a: Pick<ApplyAnswers, 'locations'>) => a.locations.length > 0 && !a.locations.some(l => CORE_LOCATIONS.includes(l))

/** Which salary scales the form shows, from where they would work. */
export function scalesFor(a: Pick<ApplyAnswers, 'locations'>): (Currency | 'OTHER')[] {
  const out: (Currency | 'OTHER')[] = []
  if (asksUsAuth(a)) out.push('USD')
  if (asksUkEuAuth(a)) out.push('GBP', 'EUR')
  if (asksOtherAuth(a)) out.push('OTHER')
  return out
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** The first thing wrong, in the person's words, or null. Step tells the form where to jump. */
export function validateAnswers(a: ApplyAnswers, opts: { needsConsent: boolean }): { step: number; message: string } | null {
  if (a.fullName.trim().length < 2) return { step: 1, message: 'Your name, please.' }
  if (!EMAIL_RE.test(a.email.trim())) return { step: 1, message: 'An email we can reach you on.' }
  if (a.linkedin.trim() && !/linkedin\.com\/in\//i.test(a.linkedin)) return { step: 1, message: 'That LinkedIn link does not look like a profile URL (linkedin.com/in/…).' }
  if (!a.looking) return { step: 2, message: 'Tell us where you are right now: looking, open, or later.' }
  if (a.locations.length === 0) return { step: 2, message: 'Pick at least one place you would work.' }
  for (const l of a.locations) {
    if (TYPED_LOCATIONS[l] && !(a.cities[l] ?? '').trim()) return { step: 2, message: `Which places, for "${l}"?` }
  }
  if (!a.setting) return { step: 2, message: 'On-site, hybrid or remote?' }
  if (asksUsAuth(a) && !a.workAuthUs) return { step: 2, message: 'Your US work authorisation. It is the first thing every founder asks.' }
  if (asksUkEuAuth(a) && a.workAuthUkEu.length === 0) return { step: 2, message: 'Your right to work in the UK or EU.' }
  if (asksOtherAuth(a) && !a.workAuthOther.trim()) return { step: 2, message: 'Your right to work where you would go.' }
  const scales = scalesFor(a)
  const needsUsd = scales.includes('USD') && !a.bases.some(b => b.currency === 'USD' && (b.band || b.amount))
  const needsUkEu = (scales.includes('GBP') || scales.includes('EUR')) && !a.bases.some(b => (b.currency === 'GBP' || b.currency === 'EUR') && (b.band || b.amount))
  if (needsUsd || needsUkEu) return { step: 2, message: 'The base salary you would move for.' }
  if (!a.startBy) return { step: 2, message: 'When could you start?' }
  if (a.functions.length === 0) return { step: 3, message: 'What kind of roles are you open to?' }
  if (a.functions.includes('Other') && !a.rolesOther.trim() && a.roles.length === 0) return { step: 3, message: 'Which roles, in your words?' }
  if (opts.needsConsent && !a.consent) return { step: 3, message: 'The consent box is unticked on purpose. Tick it if you are happy with the terms.' }
  return null
}

/** One line of what they told us, for the Slack card and the panel. */
export function saysLine(a: {
  looking?: string | null
  locations?: string[] | null
  cities?: Record<string, string> | null
  relocation?: string | null
  setting?: string | null
  work_auth_us?: string | null
  work_auth_uk_eu?: string[] | null
  work_auth_other?: string | null
  bases?: BaseAnswer[] | null
  current_base?: number | null
  start_by?: string | null
  stages?: string[] | null
  functions?: string[] | null
  roles?: string[] | null
  roles_other?: string | null
}): string {
  const money = (n: number, cur: string) => `${cur === 'GBP' ? '£' : cur === 'EUR' ? '€' : '$'}${Math.round(n / 1000)}k`
  const places = (a.locations ?? []).map(l => {
    const typed = a.cities?.[l]
    return typed ? `${l} (${typed})` : l
  })
  const bases = (a.bases ?? []).map(b => (b.band ? `${b.band} base` : b.amount ? `${money(b.amount, b.currency)} base${b.note ? ` (${b.note})` : ''}` : null)).filter(Boolean)
  const auth = [a.work_auth_us, ...(a.work_auth_uk_eu ?? []), a.work_auth_other].filter(Boolean)
  const roles = [...(a.roles ?? []).filter(r => r !== 'Other'), a.roles_other].filter(Boolean)
  return [
    LOOKING.find(l => l.key === a.looking)?.label ?? null,
    places.length ? places.join(' or ') : null,
    a.relocation ? `relocate: ${a.relocation}` : null,
    SETTINGS.find(s => s.key === a.setting)?.label ?? null,
    auth.length ? auth.join(' · ') : null,
    bases.length ? bases.join(' · ') : null,
    a.current_base ? `current ${money(a.current_base, 'USD')}` : null,
    START.find(s => s.key === a.start_by) ? `start: ${START.find(s => s.key === a.start_by)!.label.toLowerCase()}` : null,
    (a.stages ?? []).length ? (a.stages ?? []).join(', ') : null,
    (a.functions ?? []).length ? `${(a.functions ?? []).join(', ')}${roles.length ? `: ${roles.join(', ')}` : ''}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}
