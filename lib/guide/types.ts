import type { ReactNode } from 'react'

/**
 * The guide is data: sections of topics, each topic answering one question a
 * partner asks. The client component searches over the text fields and
 * renders the visual for the open topic. Visuals are React mock-ups of the
 * live screens with fictional people, never screenshots and never real names.
 */

export interface GuideStep {
  /** One action, the button or field named exactly as on the screen. */
  do: string
  /** What the partner sees or what moves as a result. Optional. */
  then?: string
}

export interface GuideEmail {
  /** Who receives it: "You", "Your candidate", "The candidate". */
  to: string
  subject: string
  /** Plain text, fictional names. */
  body: string
  from?: string
}

export interface GuideTopic {
  id: string
  /** The question, as the partner would type it. */
  title: string
  /** One or two sentences: what it is and why it exists. */
  summary: string
  /** Where it lives in the product. */
  where?: { label: string; href: string }
  steps?: GuideStep[]
  /** What happens after, in order. */
  then?: string[]
  /** The rules that apply, plainly. */
  rules?: string[]
  emails?: GuideEmail[]
  /** Extra words the search should match. */
  keywords?: string[]
  /** ISO date the feature shipped; recent ones show "New". */
  since?: string
  /** A mock-up of the screen or flow. */
  visual?: ReactNode
  /** Related topic ids. */
  related?: string[]
}

export interface GuideSection {
  id: string
  title: string
  /** One line under the section title. */
  lede: string
  topics: GuideTopic[]
}

/** A curated path through the topics for one kind of reader. */
export interface GuidePath {
  title: string
  topicIds: string[]
}

export interface GuideLaunch {
  date: string
  title: string
  text: string
  topicId: string
}
