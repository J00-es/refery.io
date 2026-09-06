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
 * Since 6 Sep 2026 the desk drives Journey A: the panel runs at the door and
 * puts the person at `decision_pending`; Lily's reaction moves them to
 * `intro_requested` (we asked the referrer), `intro_sent` (we wrote to the
 * person), `bench` (strong, no live seat) or `not_fit`. See lib/desk/.
 *
 * See lib/pipeline-stages.ts for Journey B's scout-facing display buckets.
 */

// ── Journey A ────────────────────────────────────────────────────────────────

export type JourneyStage =
  | 'uploaded'
  | 'calibrating'
  | 'decision_pending'
  | 'ready_for_intro'
  | 'bench'
  | 'intro_requested'
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
  /** Shown on the strip. Holding states (bench) and closed states are not steps. */
  onStrip: boolean
}

export const JOURNEY_STAGES: JourneyStageConfig[] = [
  {
    value: 'uploaded',
    label: 'Uploaded',
    blurb: "They're in. We're reading the résumé.",
    category: 'in_progress',
    order: 1,
    onStrip: true,
  },
  {
    value: 'calibrating',
    label: 'In review',
    blurb: "We're reviewing them against the bar.",
    category: 'in_progress',
    order: 2,
    onStrip: false,
  },
  {
    value: 'decision_pending',
    label: 'In review',
    blurb: 'The panel has read them. Waiting on Lily to decide the next step.',
    category: 'in_progress',
    order: 2,
    onStrip: true,
  },
  {
    value: 'ready_for_intro',
    label: 'In review',
    blurb: 'They cleared the bar. Waiting on Lily to decide the next step.',
    category: 'in_progress',
    order: 2,
    onStrip: false,
  },
  {
    value: 'bench',
    label: 'On the bench',
    blurb: 'Strong profile, no live search for them today. Re-matched the moment one opens.',
    category: 'in_progress',
    order: 2,
    onStrip: false,
  },
  {
    value: 'intro_requested',
    label: 'Intro asked',
    blurb: "We've asked whoever referred them for a warm introduction.",
    category: 'in_progress',
    order: 3,
    onStrip: true,
  },
  {
    value: 'intro_sent',
    label: 'Intro sent',
    blurb: "We've written to them. Waiting for them to book a call.",
    category: 'in_progress',
    order: 4,
    onStrip: true,
  },
  {
    value: 'committee_call',
    label: 'Call booked',
    blurb: 'A call with our talent committee is on the calendar.',
    category: 'in_progress',
    order: 5,
    onStrip: true,
  },
  {
    value: 'warm',
    label: 'Warm',
    blurb: "We've met them and vouch for them. We're matching them to open roles.",
    category: 'vouched',
    order: 6,
    onStrip: true,
  },
  {
    value: 'placed',
    label: 'Placed',
    blurb: 'They took a role.',
    category: 'vouched',
    order: 7,
    onStrip: false,
  },
  {
    value: 'not_fit',
    label: 'Not a fit',
    blurb: 'Not a match for the kinds of roles we work on.',
    category: 'closed',
    order: 90,
    onStrip: false,
  },
  {
    value: 'post_committee_not_fit',
    label: 'Not a fit',
    blurb: "We spoke with them, and it wasn't a fit.",
    category: 'closed',
    order: 91,
    onStrip: false,
  },
  {
    value: 'dormant',
    label: 'Gone quiet',
    blurb: "We lost touch. Worth another try if you know them.",
    category: 'closed',
    order: 92,
    onStrip: false,
  },
]

/** The steps drawn on the journey strip, in order. */
export const JOURNEY_STRIP: JourneyStageConfig[] = JOURNEY_STAGES.filter(s => s.onStrip).sort((a, b) => a.order - b.order)

export function journeyConfig(stage: JourneyStage): JourneyStageConfig {
  return JOURNEY_STAGES.find(s => s.value === stage) ?? JOURNEY_STAGES[0]
}

export function journeyLabel(stage: JourneyStage): string {
  return journeyConfig(stage).label
}

/** Where a stage sits on the strip; holding states map to the step they wait at. */
export function stripIndexOf(stage: JourneyStage): number {
  const cfg = journeyConfig(stage)
  const idx = JOURNEY_STRIP.findIndex(s => s.value === stage)
  if (idx >= 0) return idx
  return JOURNEY_STRIP.findIndex(s => s.order === cfg.order)
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
 * The stage the panel result implies when nobody has decided yet. The desk
 * now puts everyone at `decision_pending` and lets Lily choose; this remains
 * for the nightly automation and for backfills.
 */
export function stageForGrade(grade: PanelGrade | null): JourneyStage {
  if (grade === null) return 'calibrating'
  return meetsBar(grade) ? 'decision_pending' : 'not_fit'
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
    case 'intro_requested':
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

export function daysSince(iso: string | null): number {
  if (!iso) return 0
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

// ── buckets ──────────────────────────────────────────────────────────────────

/**
 * The coarse groups the product speaks in: the candidate list tabs, and the
 * dashboard's "where everyone is". Defined once here so the two cannot drift
 * into describing the same people differently.
 *
 * Each bucket has two labels: what Lily reads (the queue is hers) and what a
 * partner reads (the same people, from their side of the table).
 */
export type JourneyBucket =
  | 'in_review'
  | 'needs_you'
  | 'intro_sent'
  | 'committee_call'
  | 'warm'
  | 'bench'
  | 'on_hold'
  | 'not_fit'
  | 'benchmark'

export interface BucketConfig {
  key: JourneyBucket
  label: string
  partnerLabel: string
  blurb: string
  partnerBlurb: string
  /** Legend / progress-bar colour. */
  dot: string
  order: number
}

export const JOURNEY_BUCKETS: BucketConfig[] = [
  {
    key: 'in_review',
    label: 'Your decision',
    partnerLabel: 'In review',
    blurb: 'The panel has read them and the card is in Slack. Oldest first.',
    partnerBlurb: "We're reading them and grading them against the bar.",
    dot: '#C79A2E',
    order: 1,
  },
  {
    key: 'needs_you',
    label: 'Waiting on referrer',
    partnerLabel: 'Needs you',
    blurb: "We asked the referrer for a warm intro. Nudges go out on their own; you're told on day 12.",
    partnerBlurb: 'Waiting on a warm introduction from you. Longest wait first.',
    dot: '#1F3A2F',
    order: 2,
  },
  {
    key: 'intro_sent',
    label: 'Waiting on candidate',
    partnerLabel: 'Intro sent',
    blurb: "We've written to them with the calendar link. Waiting for a booking.",
    partnerBlurb: 'The introduction has gone out. Waiting to hear back from them.',
    dot: '#7C93A8',
    order: 3,
  },
  {
    key: 'committee_call',
    label: 'Call booked',
    partnerLabel: 'Call booked',
    blurb: 'A call is on the calendar.',
    partnerBlurb: 'A call with our talent committee is on the calendar.',
    dot: '#5E8571',
    order: 4,
  },
  {
    key: 'warm',
    label: 'Warm',
    partnerLabel: 'Warm',
    blurb: "Met and vouched for. Matched to open seats, founders first.",
    partnerBlurb: "We've met them and vouch for them. We're matching them to open roles.",
    dot: '#2E9E6B',
    order: 5,
  },
  {
    key: 'bench',
    label: 'Bench',
    partnerLabel: 'In the pool',
    blurb: 'Strong, no live seat for them today. Re-matched the moment one opens.',
    partnerBlurb: "Strong profile, nothing live fits today. You'll hear first when a search opens for them.",
    dot: '#9C9C95',
    order: 6,
  },
  {
    key: 'on_hold',
    label: 'On hold',
    partnerLabel: 'On hold',
    blurb: "Off the market right now, so there's nothing to do until that changes.",
    partnerBlurb: "Off the market right now, so there's nothing to do until that changes.",
    dot: '#C79A2E',
    order: 7,
  },
  {
    key: 'not_fit',
    label: 'Not a fit',
    partnerLabel: 'Not a fit',
    blurb: 'Not a match for the kinds of roles we work on. The reason is on each profile.',
    partnerBlurb: 'Not a match for the kinds of roles we work on. The reason is on each profile.',
    dot: '#C2544B',
    order: 8,
  },
  {
    key: 'benchmark',
    label: 'Benchmarks',
    partnerLabel: 'Benchmarks',
    blurb: 'Profiles sourced to calibrate a search. Not people we are placing.',
    partnerBlurb: 'Profiles sourced to calibrate a search. Not people we are placing.',
    dot: '#B8B8B0',
    order: 9,
  },
]

export function bucketConfig(key: JourneyBucket): BucketConfig {
  return JOURNEY_BUCKETS.find(b => b.key === key) ?? JOURNEY_BUCKETS[0]
}

export function bucketLabel(key: JourneyBucket, viewerIsAdmin: boolean): string {
  const b = bucketConfig(key)
  return viewerIsAdmin ? b.label : b.partnerLabel
}

export function bucketBlurb(key: JourneyBucket, viewerIsAdmin: boolean): string {
  const b = bucketConfig(key)
  return viewerIsAdmin ? b.blurb : b.partnerBlurb
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

  const s = c.journey_stage

  // A closed outcome is the whole story, so it wins over availability: someone
  // off the market *and* not a fit is simply not a fit.
  if (s === 'not_fit' || s === 'post_committee_not_fit') return 'not_fit'
  if (s === 'dormant') return 'needs_you'

  // Otherwise being off the market is the reason nothing is happening, and
  // saying so beats filing them under a stage they are not progressing through.
  if (c.availability_status === 'off_market') return 'on_hold'

  switch (s) {
    case 'intro_requested':
      return 'needs_you'
    case 'warm':
    case 'placed':
      return 'warm'
    case 'committee_call':
      return 'committee_call'
    case 'intro_sent':
      return 'intro_sent'
    case 'bench':
      return 'bench'
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
