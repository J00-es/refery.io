/**
 * Every automated message a partner or applicant can receive, in one place.
 *
 * Voice rules live in docs/proposals/2026-09-07-onboarding/01-voice-spec.md.
 * Commercial facts do not live here: the 70% figure is the one number this file
 * carries, and it is the partner share in every signed partner terms version
 * to date (lib/agreements.ts). A role's fee comes from the role.
 *
 * Every template renders plain text. Subjects carry the recipient's full name
 * so a thread is findable: `[Refery] Full name | context`. Braces never reach
 * a send path: `render` throws if a required fact is missing, and the caller
 * turns that into a task for Lily instead of an email.
 *
 * No model is called anywhere in this module. Personalisation is one verified
 * fact the caller already holds, never generated text.
 */

export const VOICE_VERSION = '0.1'

export type TemplateJob =
  | 'receipt'
  | 'decision'
  | 'invitation'
  | 'question'
  | 'update'
  | 'support'
  | 'reengagement'

export interface RenderedEmail {
  templateId: string
  version: string
  job: TemplateJob
  /** Essential messages ignore the optional-mail budget. */
  essential: boolean
  subject: string
  text: string
}

const CAL = 'cal.com/refery-lily/15'

function first(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || 'there'
}

function need(value: string | null | undefined, name: string): string {
  const v = (value ?? '').trim()
  if (!v) throw new MissingFact(name)
  return v
}

export class MissingFact extends Error {
  constructor(public fact: string) {
    super(`missing fact: ${fact}`)
  }
}

function subject(fullName: string, context: string): string {
  return `[Refery] ${fullName.trim()} | ${context}`
}

/** One line for a reply that comes later than it should have. Same words as the hiring-lead late line in lib/intake-emails.ts. */
function lateLine(late?: boolean): string[] {
  return late ? ['Sorry for the slow reply on this one.', ''] : []
}

function sign(lines: string[]): string {
  return [...lines, '', 'Best,', 'Lily'].join('\n')
}

// ── A · application received ────────────────────────────────────────────────

export function templateA(p: { fullName: string; reviewDate: string | null }): RenderedEmail {
  const when = p.reviewDate ? ` and you'll hear from me by ${p.reviewDate}` : ''
  return {
    templateId: 'A',
    version: VOICE_VERSION,
    job: 'receipt',
    essential: true,
    subject: subject(p.fullName, 'Application received'),
    text: sign([
      `Hi ${first(p.fullName)},`,
      '',
      'Thanks for applying to Refery :)',
      '',
      `I have your details. I'm checking where the people you know could fit the searches we're working on${when}.`,
      '',
      "If we go ahead, you'll get a link to set up your partner account and see how to start.",
    ]),
  }
}

// ── B · approved scout, independent start ───────────────────────────────────

export function templateB(p: { fullName: string; verifiedDetail: string; onboardingLink: string; late?: boolean }): RenderedEmail {
  const detail = need(p.verifiedDetail, 'verified_detail')
  const link = need(p.onboardingLink, 'onboarding_link')
  return {
    templateId: 'B',
    version: VOICE_VERSION,
    job: 'decision',
    essential: true,
    subject: subject(p.fullName, "Let's get started :)"),
    text: sign([
      `Hi ${first(p.fullName)},`,
      '',
      ...lateLine(p.late),
      `Thanks for applying, and for ${detail}. I'd be happy to have you join Refery :)`,
      '',
      'How it works on your side: you introduce people you know and would vouch for. We check the fit, talk to them, and run the process with the client. If someone you introduced is hired, 70% of the placement fee is yours under the partner terms.',
      '',
      `Set up your account here: ${link}. It explains the rest and takes you through the agreement.`,
      '',
      'No need to have someone ready today. When a person comes to mind, ask them first, then send their CV as a PDF and a few lines on why.',
    ]),
  }
}

// ── C · approved recruiter, one relevant opportunity ────────────────────────

export function templateC(p: {
  fullName: string
  specialty: string
  anonymisedSummary: string
  previewLink: string
}): RenderedEmail {
  const specialty = need(p.specialty, 'specialty')
  const summary = need(p.anonymisedSummary, 'approved_anonymised_role_summary')
  const link = need(p.previewLink, 'preview_and_start_link')
  return {
    templateId: 'C',
    version: VOICE_VERSION,
    job: 'decision',
    essential: true,
    subject: subject(p.fullName, 'A first search for us'),
    text: sign([
      `Hi ${first(p.fullName)},`,
      '',
      `Thanks for applying. You recruit ${specialty}, and one of the searches we're working on now sits right there: ${summary}.`,
      '',
      'With Refery you source and introduce candidates for the searches you choose. We handle calibration, the client and the process. You receive 70% of the placement fee, and each search shows its fee before you take it on.',
      '',
      `Take a look here: ${link}. If it's your kind of search, you can create your account and complete the agreement from the same page. The client's name and full brief open after that.`,
      '',
      "Happy to answer anything that's unclear :)",
    ]),
  }
}

// ── D · selected partner, call with a purpose at the end ────────────────────

export function templateD(p: {
  fullName: string
  verifiedDetail: string
  reason: string
  previewLink: string
  question: string
  late?: boolean
}): RenderedEmail {
  const detail = need(p.verifiedDetail, 'verified_detail')
  const reason = need(p.reason, 'reason_connected_to_the_opportunity')
  const link = need(p.previewLink, 'preview_and_start_link')
  const question = need(p.question, 'specific_question')
  return {
    templateId: 'D',
    version: VOICE_VERSION,
    job: 'decision',
    essential: true,
    subject: subject(p.fullName, 'A good place to start'),
    text: sign([
      `Hi ${first(p.fullName)},`,
      '',
      ...lateLine(p.late),
      `Thanks for applying, and for ${detail}. ${reason}, so I'd like to explore working together.`,
      '',
      `Here's a short overview and the search I'd start with: ${link}. It shows what we'd each handle, how the fee works, and how to set up your account if it feels right.`,
      '',
      `I'd also like to hear how you'd approach ${question}. When you've had a look, let's find 15 minutes: ${CAL}`,
    ]),
  }
}

// ── E · not moving forward ──────────────────────────────────────────────────

export function templateE(p: { fullName: string; focusLine: string; late?: boolean }): RenderedEmail {
  const focus = need(p.focusLine, 'current_focus_line')
  return {
    templateId: 'E',
    version: VOICE_VERSION,
    job: 'decision',
    essential: true,
    subject: subject(p.fullName, 'Your application'),
    text: sign([
      `Hi ${first(p.fullName)},`,
      '',
      ...lateLine(p.late),
      'Thank you for your interest in Refery.',
      '',
      `We're keeping this intake focused on scouts and recruiting partners with experience closest to our current searches: ${focus}.`,
      '',
      "We're not moving forward with your application at the moment. If you'd like to hear from us when that focus broadens, reply and let me know.",
      '',
      'Thanks again for taking the time to apply.',
    ]),
  }
}

// ── F · good potential, no matching search ──────────────────────────────────

export function templateF(p: { fullName: string; strength: string; whereSearchesAre: string; applied: boolean; late?: boolean }): RenderedEmail {
  const strength = need(p.strength, 'verified_strength_of_their_network')
  const where = need(p.whereSearchesAre, 'where_our_searches_are')
  return {
    templateId: 'F',
    version: VOICE_VERSION,
    job: 'decision',
    essential: true,
    subject: subject(p.fullName, 'Working together, an update'),
    text: sign([
      `Hi ${first(p.fullName)},`,
      '',
      ...lateLine(p.late),
      `${p.applied ? 'Thanks for applying. ' : ''}${strength} is a strong one, but every search we're working on today is ${where}, and I wouldn't ask you to spend time on those.`,
      '',
      "If you'd like, reply and I'll keep you in mind when something closer opens. There's nothing you need to set up in the meantime.",
    ]),
  }
}

// ── G · finish an incomplete setup ──────────────────────────────────────────

export function templateG(p: { fullName: string; existingSubject: string; resumeLink: string; incompleteStep: string }): RenderedEmail {
  const link = need(p.resumeLink, 'resume_link')
  const step = need(p.incompleteStep, 'actual_incomplete_step')
  return {
    templateId: 'G',
    version: VOICE_VERSION,
    job: 'reengagement',
    essential: false,
    subject: `Re: ${need(p.existingSubject, 'existing_subject')}`,
    text: sign([
      `Hi ${first(p.fullName)},`,
      '',
      `If you'd still like to get started, you can continue from where you left off here: ${link}.`,
      '',
      `The remaining step is ${step}. If the page isn't working or you have a question, reply here and I'll help.`,
    ]),
  }
}

// ── H · first search suggested, access ready ────────────────────────────────

export function templateH(p: {
  fullName: string
  role: string
  city: string | null
  client: string
  reason: string
  requirement: string | null
  briefLink: string
}): RenderedEmail {
  const role = need(p.role, 'role')
  const client = need(p.client, 'client')
  const reason = need(p.reason, 'specific_match_reason')
  const link = need(p.briefLink, 'brief_link')
  const req = (p.requirement ?? '').trim()
  return {
    templateId: 'H',
    version: VOICE_VERSION,
    job: 'invitation',
    essential: false,
    subject: subject(p.fullName, `${role}${p.city ? ` in ${p.city}` : ''}, worth a look?`),
    text: sign([
      `Hi ${first(p.fullName)},`,
      '',
      `I thought of you for ${role} at ${client} because ${reason}.`,
      '',
      req
        ? `The key requirement is ${req}. The brief has the scope, working setup, fee and interview process: ${link}`
        : `The brief has the scope, working setup, fee and interview process: ${link}`,
      '',
      "If it looks like a search you'd want to work on, you can accept it there. If it isn't your focus, let me know and I'll adjust what I suggest :)",
    ]),
  }
}

// ── K · submission received ─────────────────────────────────────────────────

export function templateK(p: {
  fullName: string
  candidate: string
  role: string
  statusLink: string
  reviewDate: string
  attributionConfirmed: boolean
}): RenderedEmail {
  const candidate = need(p.candidate, 'candidate')
  const role = need(p.role, 'role')
  const link = need(p.statusLink, 'candidate_status_link')
  const date = need(p.reviewDate, 'real_review_date')
  return {
    templateId: 'K',
    version: VOICE_VERSION,
    job: 'receipt',
    essential: true,
    subject: subject(p.fullName, `${candidate} received`),
    text: sign([
      `Hi ${first(p.fullName)},`,
      '',
      `Thanks for introducing ${candidate}. We have the CV and your notes for ${role}.`,
      '',
      `You can follow the review here: ${link}. The next update is due by ${date}.`,
      ...(p.attributionConfirmed
        ? ['', `Your submission is confirmed and timestamped, so ${candidate} is yours for this client under the submission terms.`]
        : ['', 'One thing on our side: the attribution record is still confirming. Nothing needed from you; it shows on the page when done.']),
    ]),
  }
}

// ── N · pause reminders ─────────────────────────────────────────────────────

export function templateN(p: { fullName: string; existingSubject: string }): RenderedEmail {
  return {
    templateId: 'N',
    version: VOICE_VERSION,
    job: 'reengagement',
    essential: false,
    subject: `Re: ${need(p.existingSubject, 'existing_subject')}`,
    text: sign([
      `Hi ${first(p.fullName)},`,
      '',
      "I'll pause the onboarding reminders here. If the timing becomes better, reply and we can pick it up from where you left off.",
    ]),
  }
}

// ── P · pending review, honest update ───────────────────────────────────────

export function templateP(p: { fullName: string; newReviewDate: string }): RenderedEmail {
  const date = need(p.newReviewDate, 'new_review_date')
  return {
    templateId: 'P',
    version: VOICE_VERSION,
    job: 'update',
    essential: true,
    subject: `Re: ${subject(p.fullName, 'Application received')}`,
    text: sign([
      `Hi ${first(p.fullName)},`,
      '',
      `Quick note so you're not left wondering: your application is still with me, and I'll come back to you by ${date}.`,
    ]),
  }
}

// ── S · reply with a personal invitation (Lily's own outbound) ──────────────

export function templateS(p: { fullName: string; existingSubject: string; invitationLink: string; answer: string | null }): RenderedEmail {
  const link = need(p.invitationLink, 'invitation_link')
  return {
    templateId: 'S',
    version: VOICE_VERSION,
    job: 'invitation',
    essential: true,
    subject: `Re: ${need(p.existingSubject, 'existing_subject')}`,
    text: sign([
      `Hi ${first(p.fullName)},`,
      '',
      'Great, thanks for coming back to me :)',
      ...(p.answer?.trim() ? ['', p.answer.trim()] : []),
      '',
      `Here's your invitation: ${link}. It shows the search in a little more detail, what we'd each handle, and takes you through creating your account and the partner terms. The client's name and the full brief open once that's done, because every client has a confidentiality agreement with us.`,
    ]),
  }
}

// ── U · Lily opens the door to a call ───────────────────────────────────────

export function templateU(p: { fullName: string; role: string; reason: string }): RenderedEmail {
  const role = need(p.role, 'role')
  const reason = need(p.reason, 'reason_lily_wants_to_talk')
  return {
    templateId: 'U',
    version: VOICE_VERSION,
    job: 'invitation',
    essential: false,
    subject: subject(p.fullName, `15 minutes on ${role}?`),
    text: sign([
      `Hi ${first(p.fullName)},`,
      '',
      'Welcome, and thanks for setting up your account :)',
      '',
      `I saw you have had a look at ${role}. ${reason}. I would like to hear how you would approach it, and it is a good moment to calibrate before you send anyone.`,
      '',
      `Fifteen minutes here, whenever suits: ${CAL}`,
      '',
      'If you would rather just get going, that is completely fine too.',
    ]),
  }
}

// ── Ask · one question from Lily, typed in the Slack thread ─────────────────

export function templateAsk(p: { fullName: string; question: string }): RenderedEmail {
  const q = need(p.question, 'question')
  return {
    templateId: 'ASK',
    version: VOICE_VERSION,
    job: 'question',
    essential: true,
    subject: `Re: ${subject(p.fullName, 'Application received')}`,
    text: sign([`Hi ${first(p.fullName)},`, '', 'One quick question before I come back to you on your application:', '', q, '', 'Just reply here.']),
  }
}

/**
 * The line that says what we are hiring for right now, for E and F. Built from
 * the live searches, not from memory, so it stays true as the desk changes.
 */
export function focusLine(input: { functions: string[]; cities: string[]; stages: string[] }): string {
  const fn = input.functions.length ? input.functions.join(' and ') : 'engineering and GTM'
  const st = input.stages.length ? input.stages.join(' to ') : 'Seed to Series B'
  const ci = input.cities.length ? input.cities.join(' and ') : 'San Francisco and New York'
  return `${fn} at ${st} startups, mainly in ${ci}`
}

// ── CS · a person who shared their own CV ───────────────────────────────────

export function templateCS1(p: { fullName: string; reviewDate: string | null; profileLink: string }): RenderedEmail {
  const link = need(p.profileLink, 'profile_link')
  const when = p.reviewDate ? ` by ${p.reviewDate}` : ' within two working days'
  return {
    templateId: 'CS1',
    version: VOICE_VERSION,
    job: 'receipt',
    essential: true,
    subject: subject(p.fullName, 'Your profile is in'),
    text: sign([
      `Hi ${first(p.fullName)},`,
      '',
      'Thanks for sharing your CV with Refery :)',
      '',
      `I read every profile myself. You'll hear from me${when}, either way: a short call if a live search fits, or a note that I'm keeping you in mind.`,
      '',
      'Nothing about you goes to a company until you say yes to that specific role.',
      '',
      `Your private profile, to update what you're looking for, pause, or delete: ${link}`,
    ]),
  }
}

export function templateCS1Dup(p: { fullName: string; profileLink: string }): RenderedEmail {
  const link = need(p.profileLink, 'profile_link')
  return {
    templateId: 'CS1-dup',
    version: VOICE_VERSION,
    job: 'receipt',
    essential: true,
    subject: subject(p.fullName, 'Your profile, already with us'),
    text: sign([
      `Hi ${first(p.fullName)},`,
      '',
      'Good news: your profile is already with Refery, so nothing was created twice.',
      '',
      `If what you're looking for has changed, update it here: ${link}. Anything you change re-runs the match the same day.`,
    ]),
  }
}

export function templateCSLink(p: { fullName: string; profileLink: string }): RenderedEmail {
  const link = need(p.profileLink, 'profile_link')
  return {
    templateId: 'CS-link',
    version: VOICE_VERSION,
    job: 'support',
    essential: true,
    subject: subject(p.fullName, 'Your private profile link'),
    text: sign([`Hi ${first(p.fullName)},`, '', `Here is your private Refery profile, to update what you're looking for, pause, or delete: ${link}`, '', 'This link is yours alone. If you did not ask for it, ignore this email and nothing changes.']),
  }
}

export function templateCSP(p: { fullName: string; newReviewDate: string }): RenderedEmail {
  const date = need(p.newReviewDate, 'new_review_date')
  return {
    templateId: 'CSP',
    version: VOICE_VERSION,
    job: 'update',
    essential: true,
    subject: `Re: ${subject(p.fullName, 'Your profile is in')}`,
    text: sign([`Hi ${first(p.fullName)},`, '', `Quick note so you're not left wondering: your profile is still with me, and I'll come back to you by ${date}.`]),
  }
}

export function templateCS6(p: { fullName: string; keptUntil: string; lookingLink: string; pauseLink: string; deleteLink: string; lapsed: boolean }): RenderedEmail {
  const until = need(p.keptUntil, 'kept_until')
  return {
    templateId: p.lapsed ? 'CS6-lapse' : 'CS6',
    version: VOICE_VERSION,
    job: 'reengagement',
    essential: false,
    subject: subject(p.fullName, p.lapsed ? 'your profile is paused' : 'still open to a move?'),
    text: sign(
      p.lapsed
        ? [
            `Hi ${first(p.fullName)},`,
            '',
            `It has been two years since you shared your profile with me, so as promised I've paused it: nothing more is suggested to you unless you say so.`,
            '',
            `Still open to a move? One tap keeps you in mind for another two years: ${need(p.lookingLink, 'looking_link')}`,
            `Or delete everything: ${need(p.deleteLink, 'delete_link')}`,
          ]
        : [
            `Hi ${first(p.fullName)},`,
            '',
            'Six months since you shared your profile with me. Still open?',
            '',
            `Still looking: ${need(p.lookingLink, 'looking_link')}`,
            `Pause for now: ${need(p.pauseLink, 'pause_link')}`,
            `Delete my profile: ${need(p.deleteLink, 'delete_link')}`,
            '',
            `If I don't hear back, nothing changes: your profile stays with me until ${until}, and you can change your mind any time from the same links.`,
          ],
    ),
  }
}
