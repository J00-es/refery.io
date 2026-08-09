/**
 * The candidate journey — the single source of truth for where we are with a
 * person, and what (if anything) that means someone has to do.
 *
 * There are two state machines here and keeping them apart is the whole point:
 *
 *   Journey A — the person.        One row per candidate, runs once.
 *                                  Lives in `candidates.journey_stage`.
 *   Journey B — the person × role.  One row per pairing, runs N times in
 *                                  parallel. Lives in `job_candidate_pipeline`
 *                                  .stage plus `pipeline_internal_state`.
 *
 * A candidate can be at `offer` with one company and `job_matched` with another
 * at the same moment, so per-role progress can never collapse into a field on
 * the person. `warm` is the handoff: reaching it is what licenses matching.
 *
 * See lib/pipeline-stages.ts for Journey B's scout-facing display buckets.
 */

// ── Journey A ────────────────────────────────────────────────────────────────

export type JourneyStage =
  | 'uploaded'
  | 'calibrating'
  | 'ready_for_intro'
  | 'intro_sent'
  | 'committee_call'
  | 'warm'
  | 'not_fit'
  | 'post_committee_not_fit'
  | 'dormant'
  | 'placed'

export type PanelGrade = 'A+' | 'A' | 'A-' | 'B+' | 'pass'

export interface JourneyStageConfig {
  value: JourneyStage
  /**
   * What a scout or recruiter reads. Never the enum value — nobody outside the
   * team should have to learn our vocabulary to use the product.
   */
  label: string
  /** The one-line explanation, shown on the detail page under the strip. */
  blurb: string
  category: 'in_progress' | 'vouched' | 'closed'
  /** Position on the journey strip. Closed states sit off the strip entirely. */
  order: number
}

export const JOURNEY_STAGES: JourneyStageConfig[] = [
  {
    value: 'uploaded',
    label: 'Uploaded',
    blurb: "They're in. We're reading the résumé.",
    category: 'in_progress',
    order: 1,
  },
  {
    value: 'calibrating',
    label: 'In review',
    blurb: "We're reviewing them against the bar.",
    category: 'in_progress',
    order: 2,
  },
  {
    value: 'ready_for_intro',
    label: 'Ready for intro',
    blurb: 'They cleared the bar and are waiting on a warm introduction.',
    category: 'in_progress',
    order: 3,
  },
  {
    value: 'intro_sent',
    label: 'Intro sent',
    blurb: "Intro made. Waiting to hear back from them.",
    category: 'in_progress',
    order: 4,
  },
  {
    value: 'committee_call',
    label: 'Call booked',
    blurb: 'A call with our talent committee is on the calendar.',
    category: 'in_progress',
    order: 5,
  },
  {
    value: 'warm',
    label: 'Warm',
    blurb: "We've met them and vouch for them. We're matching them to open roles.",
    category: 'vouched',
    order: 6,
  },
  {
    value: 'placed',
    label: 'Placed',
    blurb: 'They took a role.',
    category: 'vouched',
    order: 7,
  },
  {
    value: 'not_fit',
    label: 'Not a fit',
    blurb: 'Not a match for the kinds of roles we work on.',
    category: 'closed',
    order: 90,
  },
  {
    value: 'post_committee_not_fit',
    label: 'Not a fit',
    blurb: "We spoke with them, and it wasn't a fit.",
    category: 'closed',
    order: 91,
  },
  {
    value: 'dormant',
    label: 'Gone quiet',
    blurb: "We lost touch. Worth another try if you know them.",
    category: 'closed',
    order: 92,
  },
]

/** The steps drawn on the journey strip, in order. Closed states are not steps. */
export const JOURNEY_STRIP: JourneyStageConfig[] = JOURNEY_STAGES.filter(
  s => s.category !== 'closed' && s.value !== 'placed'
).sort((a, b) => a.order - b.order)

export function journeyConfig(stage: JourneyStage): JourneyStageConfig {
  return JOURNEY_STAGES.find(s => s.value === stage) ?? JOURNEY_STAGES[0]
}

export function journeyLabel(stage: JourneyStage): string {
  return journeyConfig(stage).label
}

// ── the A− bar ───────────────────────────────────────────────────────────────

/**
 * Grades at or above the bar. A default, not a gate: 7 of the 21 candidates who
 * reached a committee call were graded below it, and those were deliberate
 * exceptions rather than mistakes. The rule sets the opening position; anyone
 * with the right role can move a candidate by hand afterwards, and the move is
 * recorded in `candidate_activity_log` with their name on it.
 */
const AT_OR_ABOVE_BAR: PanelGrade[] = ['A+', 'A', 'A-']

export function meetsBar(grade: PanelGrade | null): boolean {
  return grade !== null && AT_OR_ABOVE_BAR.includes(grade)
}

/**
 * The stage the panel result implies. Returns `calibrating` for an ungraded
 * candidate — including the ones whose `recruiter_verdict` is prose rather than
 * a verdict value, which need re-panelling rather than a guess.
 */
export function stageForGrade(grade: PanelGrade | null): JourneyStage {
  if (grade === null) return 'calibrating'
  return meetsBar(grade) ? 'ready_for_intro' : 'not_fit'
}

// ── next action ──────────────────────────────────────────────────────────────

/**
 * The only thing a scout actually needs from all of the above: is the ball in
 * their court, and if so what's the verb.
 *
 * Deliberately returns null for most stages. If every row asks for attention
 * then none of them do — the handful of rows that return an action *are* the
 * to-do list, and everything else should render as quiet grey text.
 */
export interface NextAction {
  label: string
  /** `do` gets the accent chip; `chase` is a softer prompt on a stalled row. */
  tone: 'do' | 'chase'
}

/** How long we wait on a candidate before suggesting a nudge. */
const NUDGE_AFTER_DAYS = 7

export function nextActionFor(candidate: {
  journey_stage: JourneyStage
  journey_stage_at: string | null
  availability_status?: string | null
  intake_source?: string | null
}): NextAction | null {
  // A calibration profile was sourced to benchmark a search, not to be placed.
  // 19 of them were sitting in the intro queue before intake_source existed to
  // say so, which is most of the reason the queue looked longer than it was.
  if (candidate.intake_source === 'calibration') return null

  // Availability answers a different question from journey stage, and it wins
  // over any prompt: someone can be vouched and ready for an intro while being
  // off the market until January. Asking a scout to introduce them anyway is
  // how a to-do list loses the scout's trust.
  if (candidate.availability_status === 'off_market') return null

  switch (candidate.journey_stage) {
    case 'ready_for_intro':
      return { label: 'Make the intro', tone: 'do' }
    case 'intro_sent':
      return daysSince(candidate.journey_stage_at) >= NUDGE_AFTER_DAYS
        ? { label: 'Nudge them', tone: 'chase' }
        : null
    case 'dormant':
      return { label: 'Re-engage', tone: 'chase' }
    default:
      return null
  }
}

function daysSince(iso: string | null): number {
  if (!iso) return 0
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

// ── buckets ──────────────────────────────────────────────────────────────────

/**
 * The coarse groups the product speaks in: the candidate list tabs, and the
 * dashboard's "where everyone is". Defined once here so the two cannot drift
 * into describing the same people differently.
 */
export type JourneyBucket =
  | 'needs_you'
  | 'in_review'
  | 'intro_sent'
  | 'committee_call'
  | 'warm'
  | 'on_hold'
  | 'not_fit'
  | 'benchmark'

export interface BucketConfig {
  key: JourneyBucket
  label: string
  blurb: string
  /** Legend / progress-bar colour. */
  dot: string
  order: number
}

export const JOURNEY_BUCKETS: BucketConfig[] = [
  {
    key: 'needs_you',
    label: 'Needs you',
    blurb: 'Waiting on a warm introduction from you. Longest wait first.',
    dot: '#1F4D3A',
    order: 1,
  },
  {
    key: 'in_review',
    label: 'In review',
    blurb: "We're reading them and grading them against the bar.",
    dot: '#C9D9CF',
    order: 2,
  },
  {
    key: 'intro_sent',
    label: 'Intro sent',
    blurb: 'The introduction has gone out. Waiting to hear back from them.',
    dot: '#7C93A8',
    order: 3,
  },
  {
    key: 'committee_call',
    label: 'Call booked',
    blurb: 'A call with our talent committee is on the calendar.',
    dot: '#5E8571',
    order: 4,
  },
  {
    key: 'warm',
    label: 'Warm',
    blurb: "We've met them and vouch for them. We're matching them to open roles.",
    dot: '#2E9E6B',
    order: 5,
  },
  {
    key: 'on_hold',
    label: 'On hold',
    blurb: "Off the market right now, so there's nothing to do until that changes.",
    dot: '#C79A2E',
    order: 6,
  },
  {
    key: 'not_fit',
    label: 'Not a fit',
    blurb: 'Not a match for the kinds of roles we work on.',
    dot: '#C2544B',
    order: 7,
  },
  {
    key: 'benchmark',
    label: 'Benchmarks',
    blurb: 'Profiles sourced to calibrate a search. Not people we are placing.',
    dot: '#B8B8B0',
    order: 8,
  },
]

export function bucketConfig(key: JourneyBucket): BucketConfig {
  return JOURNEY_BUCKETS.find(b => b.key === key) ?? JOURNEY_BUCKETS[0]
}

/**
 * Assign a candidate to exactly one bucket. First match wins, which is what
 * makes the buckets disjoint and their counts add up to the roster — if they
 * ever stop adding up, something is being hidden.
 */
export function journeyBucket(c: {
  journey_stage: JourneyStage
  journey_stage_at: string | null
  availability_status?: string | null
  intake_source?: string | null
}): JourneyBucket {
  if (c.intake_source === 'calibration') return 'benchmark'
  if (nextActionFor(c) !== null) return 'needs_you'

  const s = c.journey_stage

  // A closed outcome is the whole story, so it wins over availability: someone
  // off the market *and* not a fit is simply not a fit.
  if (s === 'not_fit' || s === 'post_committee_not_fit' || s === 'dormant') return 'not_fit'

  // Otherwise being off the market is the reason nothing is happening, and
  // saying so beats filing them under a stage they are not progressing through.
  if (c.availability_status === 'off_market') return 'on_hold'

  switch (s) {
    case 'warm':
    case 'placed':
      return 'warm'
    case 'committee_call':
      return 'committee_call'
    case 'intro_sent':
      return 'intro_sent'
    default:
      return 'in_review'
  }
}

// ── Journey B: the internal ladder ───────────────────────────────────────────

/**
 * Stages that live in `pipeline_internal_state`, readable only by admins. They
 * are in their own table rather than as extra `job_candidate_pipeline.stage`
 * values because RLS hides rows, not column values — hiding deep stages inside
 * `stage` would make a scout's candidate disappear from their dashboard at the
 * exact moment things started going well.
 */
export type InternalStage =
  | 'hm_interested'
  | 'hm_intro_done'
  | 'interviewing'
  | 'offer'
  | 'placed'
  | 'hm_passed'
  | 'withdrew'

/**
 * What the candidate or company is waiting on. A flag rather than a stage: the
 * wait repeats after every interview round, and a repeating value in a linear
 * ladder makes "how many reached interview" unanswerable.
 */
export type Awaiting = 'hm_feedback' | 'candidate_reply' | 'scheduling'

export const INTERNAL_STAGE_LABELS: Record<InternalStage, string> = {
  hm_interested: 'HM interested',
  hm_intro_done: 'Intro done',
  interviewing: 'Interviewing',
  offer: 'Offer out',
  placed: 'Placed',
  hm_passed: 'HM passed',
  withdrew: 'Withdrew',
}

export const AWAITING_LABELS: Record<Awaiting, string> = {
  hm_feedback: 'Waiting on HM feedback',
  candidate_reply: 'Waiting on the candidate',
  scheduling: 'Waiting on scheduling',
}

/**
 * What a non-admin sees in place of any internal stage. Every internal value
 * collapses to the existing `in_play` display bucket, so partner-facing copy
 * never leaks a stage that isn't theirs to see — enforced here rather than by
 * remembering to filter at each call site.
 */
export function partnerFacingInternal(stage: InternalStage): 'in_play' | 'placed' | 'closed' {
  if (stage === 'placed') return 'placed'
  if (stage === 'hm_passed' || stage === 'withdrew') return 'closed'
  return 'in_play'
}
