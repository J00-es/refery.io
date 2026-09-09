import { stableHash } from './evidence'

export const SCORECARD_VERSION = 'source-draft-v1'
const DIMENSIONS: Record<string, string[]> = {
  engineering: ['Shipped systems and personal ownership', 'Reliability and technical complexity', 'Product judgment and collaboration'],
  research: ['Research contribution and experimental rigor', 'Reproducibility and evaluation', 'Translation into useful systems'],
  product: ['Customer problem and outcome ownership', 'Prioritization and tradeoffs', 'Cross-functional delivery'],
  design: ['User research and problem framing', 'Design craft and shipped outcomes', 'Collaboration and iteration'],
  gtm: ['Customer segment and sales motion', 'Attributed revenue or retention outcomes', 'Repeatable execution and collaboration'],
  operations: ['Process ownership and measurable improvement', 'Scale and operational complexity', 'Stakeholder execution'],
  finance: ['Financial ownership and decision support', 'Accuracy and controls', 'Business partnership'],
  people: ['Hiring or people-program outcomes', 'Scope and operating judgment', 'Stakeholder partnership'],
  other: ['Relevant delivered outcomes', 'Ownership and complexity', 'Collaboration'],
}
export function draftScorecard(job: Record<string, unknown>, family: string, brief?: { id: string; version: number; content: unknown }) {
  if (!(family in DIMENSIONS)) throw new Error('Choose a supported role family')
  const requirements = ['description', 'requirements', 'skills_required'].flatMap(key => {
    const value = job[key]
    if (value === undefined || value === null || value === '') return []
    return [{ source: `jobs.${key}`, quote: value, priority: 'unconfirmed', hard_gate: false }]
  })
  const content = {
    builder_version: SCORECARD_VERSION, family, title: job.title ?? null,
    requirements, hiring_manager_brief: brief ?? null,
    dimensions: DIMENSIONS[family].map(name => ({ name, anchors: {
      unknown: 'Insufficient relevant evidence; ask a question without a score penalty.',
      '0': 'Concrete evidence contradicts the confirmed requirement.',
      '1': 'Adjacent evidence; the required responsibility is not demonstrated.',
      '2': 'Direct evidence at part of the required scope.',
      '3': 'Direct evidence at the required scope and complexity.',
      '4': 'Repeated direct evidence at or above the required scope.',
    } })),
    priorities_confirmed: false, outcomes: [],
    confirmation_questions: ['Which outcomes must this hire deliver in the first 6–12 months?', 'Which requirements are truly essential, and what adjacent experience is acceptable?', 'What evidence distinguishes success at this scope?'],
  }
  return { content, contentHash: stableHash(content) }
}
