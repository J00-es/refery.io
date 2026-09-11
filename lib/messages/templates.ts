/**
 * What a partner can say to their own candidate from the portal, in the
 * partner's voice, one template per moment.
 *
 * These are drafts, not sends: the partner edits every word before Send.
 * First person, short, no Refery jargon. No model is called anywhere here;
 * every fact is one the caller already holds. A brace never reaches a send
 * path: the test in tests/messages/templates.test.ts renders every moment with
 * every optional fact empty.
 *
 * Subjects are the partner's own words, not the "[Refery] Name | step" form
 * Lily's desk uses: the candidate is hearing from the person they know.
 */

/** Lily's booking page, the same one every desk email carries. */
export const LILY_CAL = 'https://cal.com/refery-lily/15'

export type Moment = 'received' | 'consent' | 'intro' | 'interview' | 'pass' | 'hired' | 'blank'

export const MOMENTS: Moment[] = ['received', 'consent', 'intro', 'interview', 'pass', 'hired', 'blank']

export const MOMENT_LABEL: Record<Moment, string> = {
  received: 'Received your CV',
  consent: 'Put you forward',
  intro: 'Meet Lily',
  interview: 'They want to meet you',
  pass: 'Not this time',
  hired: 'Congratulations',
  blank: 'Blank',
}

/** Kind written to candidate_emails for each moment. */
export const MOMENT_KIND: Record<Moment, string> = {
  received: 'partner_received',
  consent: 'partner_consent',
  intro: 'partner_intro',
  interview: 'partner_interview',
  pass: 'partner_pass',
  hired: 'partner_hired',
  blank: 'partner_blank',
}

export interface MomentFacts {
  candidateFirst: string
  partnerFirst: string
  partnerName: string
  /** "name, title, phone" as the partner saved it on /profile; falls back to the name. */
  signature: string | null
  /** The search headline, when a submission is in play. */
  searchHeadline: string | null
  /** The alias until the person has agreed, the client's name after. */
  companyOrAlias: string | null
  city: string | null
  /** The client's booking link, on interview. */
  bookingLink: string | null
  /** The client's interview steps, one per line, on interview. */
  interviewSteps: string | null
  /** The client's reason, in the partner's words, on a pass. */
  reason: string | null
  /** "12 October 2026" on hired. */
  startDate: string | null
  /** The one-tap consent page, on consent. Required for that moment. */
  consentLink: string | null
}

export interface Draft {
  subject: string
  body: string
}

function firstOf(name: string): string {
  return (name ?? '').trim().split(/\s+/)[0] || 'there'
}

function signoff(f: MomentFacts): string {
  const sig = (f.signature ?? '').trim()
  return sig || f.partnerName.trim() || f.partnerFirst
}

/** Draft a moment. Throws on the one fact a moment cannot do without. */
export function renderMoment(moment: Moment, f: MomentFacts): Draft {
  const first = firstOf(f.candidateFirst)
  const sig = signoff(f)
  const company = (f.companyOrAlias ?? '').trim() || 'the company'
  switch (moment) {
    case 'received':
      return {
        subject: 'You are on Refery, here is what happens next',
        body: [
          `Hi ${first},`,
          '',
          'As we discussed, your CV is now on Refery, the network I use to put people in front of early-stage teams. Nothing goes to any company until you say yes to that specific conversation, and I will only come back to you when something is worth your time.',
          '',
          'If anything in your CV should change, reply to this email.',
          '',
          sig,
        ].join('\n'),
      }
    case 'consent': {
      const link = (f.consentLink ?? '').trim()
      if (!link) throw new MissingFact('consent_link')
      const role = (f.searchHeadline ?? '').trim() || 'a role'
      const where = f.city && !company.toLowerCase().includes(f.city.toLowerCase()) ? ` in ${f.city}` : ''
      return {
        subject: 'A role I would like to put you forward for',
        body: [
          `Hi ${first},`,
          '',
          `There is a ${role} seat at ${company}${where} that fits what you told me. The company is named the moment you say yes; nothing is shared with them before that.`,
          '',
          'May I put you forward through Refery? One tap either way:',
          link,
          '',
          `If it is not for you, the same page has a "not now". Either way I hear back today.`,
          '',
          sig,
        ].join('\n'),
      }
    }
    case 'intro': {
      const focus = (f.searchHeadline ?? '').trim() ? `on the ${f.searchHeadline!.trim()} search` : 'on a few early-stage searches'
      return {
        subject: `Intro: ${first} <> Lily Joo (Refery)`,
        body: [
          `${first}, meet Lily from Refery. Lily works with a few early-stage teams ${focus} and asked about you after I shared your background.`,
          '',
          `Lily, ${first} is the one I mentioned. I will let you two take it from here.`,
          '',
          `${first}, the quickest way in is fifteen minutes with Lily whenever suits you: ${LILY_CAL}`,
          '',
          sig,
        ].join('\n'),
      }
    }
    case 'interview': {
      const role = (f.searchHeadline ?? '').trim()
      const link = (f.bookingLink ?? '').trim()
      const steps = (f.interviewSteps ?? '').trim()
      return {
        subject: `${company} would like to meet you`,
        body: [
          `Hi ${first},`,
          '',
          `Good news: ${company} read your profile${role ? ` for the ${role} role` : ''} and want to talk.${link ? ` Book a time that suits you here:\n${link}` : ' Lily at Refery is setting up the first call with them and will come back to you with times.'}`,
          '',
          ...(steps ? [`Their process, as they described it:\n${steps}`, ''] : []),
          'If you want to prep together before the first call, reply and we will find twenty minutes.',
          '',
          sig,
        ].join('\n'),
      }
    }
    case 'pass': {
      const reason = (f.reason ?? '').trim()
      return {
        subject: `${company}, an update`,
        body: [
          `Hi ${first},`,
          '',
          `${company} decided not to move forward this time.${reason ? ` Their reason, in short: ${reason}` : ''}`,
          '',
          'I do not think it says much about you, and I would like to keep you in mind for the next one. Say if that is not what you want.',
          '',
          sig,
        ].join('\n'),
      }
    }
    case 'hired': {
      const start = (f.startDate ?? '').trim()
      return {
        subject: `Congratulations, ${first}`,
        body: [
          `Hi ${first},`,
          '',
          `Congratulations on accepting the offer from ${company}.${start ? ` ${start} is the day.` : ''} Thank you for trusting me with this one.`,
          '',
          'If anything comes up between now and your start, or after, you know where I am.',
          '',
          sig,
        ].join('\n'),
      }
    }
    case 'blank':
      return { subject: '', body: ['', '', sig].join('\n') }
  }
}

export class MissingFact extends Error {
  constructor(public fact: string) {
    super(`missing fact: ${fact}`)
  }
}

/** The one line under every message. Plain text; the HTML version links the stop URL. */
export function footerText(partnerName: string, partnerFirst: string, stopUrl: string): string {
  return `Sent by ${partnerName} through Refery. Replies go to ${partnerFirst}. Prefer no email from Refery? ${stopUrl}`
}
