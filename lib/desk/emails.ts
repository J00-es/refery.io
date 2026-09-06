/**
 * The emails the desk writes without a model: the ones Lily sends the same
 * way every time. Everything here is lifted from her sent mail.
 *
 *   calendar reply     when a referrer's intro lands with the candidate on it
 *   pre-call questions the six things she asks before a call
 *   nudges             day 3 and 7 to a referrer, day 4 to a candidate
 *   partner updates    "here is where we are" after a decision
 *
 * Plain text, no signature block, no em dashes. Client names only where the
 * caller says the recipient may see them.
 */

import { firstNameOf } from '@/lib/desk/people'

export const CAL_LINK = 'cal.com/refery-lily/15'

export const PRECALL_QUESTIONS: Record<string, string> = {
  stage: 'What stage of startup are you most excited about, and why?',
  roles: 'Which roles or titles are you targeting?',
  location: 'Where are you based, and are you open to relocating to SF or NY?',
  visa: 'Do you need visa sponsorship in the US?',
  comp: 'What base range are you targeting?',
  start: 'When could you start?',
}

/** The reply Lily sends the moment an intro lands. Questions the record already answers are left out. */
export function calendarReply(input: {
  candidateName: string
  referrerFirstName: string | null
  missing: string[]
  hasCv: boolean
}): { subject: string; body: string } {
  const first = firstNameOf(input.candidateName)
  const asks = Object.entries(PRECALL_QUESTIONS)
    .filter(([k]) => input.missing.includes(k))
    .map(([, q]) => `• ${q}`)
  const needCv = !input.hasCv
  const askBlock =
    asks.length || needCv
      ? `\n\nAnd if you can share ${needCv ? 'your CV and ' : ''}${asks.length ? 'the answers below' : ''} before the call, that helps me check which roles fit you:${asks.length ? `\n${asks.join('\n')}` : ''}`
      : ''
  return {
    subject: `${first} / Lily @ Refery`,
    body: `Hi ${first}, great to meet you!${input.referrerFirstName ? ` Thanks for the intro, ${input.referrerFirstName}.` : ''}

Happy to chat. Please grab a slot here: ${CAL_LINK}${askBlock}

Looking forward to it!
Lily`,
  }
}

export function referrerNudge(input: { referrerFirstName: string; candidateName: string; attempt: 1 | 2 }): string {
  const name = input.candidateName.split(/\s+/)[0]
  if (input.attempt === 1) {
    return `Hi ${input.referrerFirstName}, quick nudge on ${name} :) Would you mind connecting us when you get a minute? Just an email with us both on it is perfect.

Best,
Lily`
  }
  return `Hi ${input.referrerFirstName}, one more nudge on ${name}. The search is moving this month, so if it is easier I am happy to reach out to ${name} directly and say it came from you. Just say the word :)

Best,
Lily`
}

export function candidateNudge(input: { candidateName: string }): string {
  const first = firstNameOf(input.candidateName)
  return `Hi ${first}, quick nudge in case this got buried :)

The searches I mentioned are moving this month, so if you are still interested it would be great to get 15 minutes on the calendar: ${CAL_LINK}

Best,
Lily`
}

/** When Lily reaches out herself after a referrer never connected them. */
export function directAfterReferrer(input: { candidateName: string; referrerName: string; seatLines: string[] }): { subject: string; body: string } {
  const first = firstNameOf(input.candidateName)
  return {
    subject: `${first} / Lily @ Refery`,
    body: `Hi ${first},

${input.referrerName} mentioned you to me and shared your background, and I wanted to reach out directly. I run Refery, a small referral network that places people into early-stage startups, and I think you could be a strong fit for ${input.seatLines.length === 1 ? 'a search' : 'a couple of searches'} we are running right now:
${input.seatLines.map(l => `• ${l}`).join('\n')}

Would love a quick call to hear what you are looking for: ${CAL_LINK}

Best,
Lily`,
  }
}

/** The line to the referrer when we give up waiting and go direct, or mark the person dormant. */
export function referrerOutcome(input: { referrerFirstName: string; candidateName: string; outcome: 'went_direct' | 'dormant' | 'booked' | 'spoke' }): string {
  const name = input.candidateName.split(/\s+/)[0]
  switch (input.outcome) {
    case 'went_direct':
      return `Hi ${input.referrerFirstName}, I reached out to ${name} directly and mentioned it came from you, so you are covered either way. Will keep you posted :)

Best,
Lily`
    case 'dormant':
      return `Hi ${input.referrerFirstName}, no reply from ${name} after a couple of nudges, so I am parking them for now. Still under your name, and if you hear they are looking again just let me know :)

Best,
Lily`
    case 'booked':
      return `Hi ${input.referrerFirstName}, ${name} booked a call with me. Will come back to you right after :)

Best,
Lily`
    case 'spoke':
      return `Hi ${input.referrerFirstName}, spoke with ${name}. Recap coming shortly.

Best,
Lily`
  }
}

/** Ask a partner the facts the record is missing. Appended to whichever email goes first. */
export function missingFactsAsk(missing: string[], candidateName: string): string {
  const first = candidateName.split(/\s+/)[0]
  const parts: string[] = []
  if (missing.includes('visa')) parts.push('whether they need US sponsorship')
  if (missing.includes('location')) parts.push('where they want to be (SF, NY, elsewhere)')
  if (missing.includes('comp')) parts.push('the base range they are targeting')
  if (!parts.length) return ''
  return `\n\nOne quick thing: do you know ${parts.join(', ')} for ${first}? It helps me match faster.`
}

/** The auto-reply when a CV arrives by email from someone we do not know. */
export function inboundCvAck(input: { senderFirstName: string; candidateName: string | null }): { subject: string; body: string } {
  const who = input.candidateName ? input.candidateName.split(/\s+/)[0] : 'them'
  return {
    subject: `Re: ${input.candidateName ? `${input.candidateName} ` : ''}CV received`,
    body: `Hi ${input.senderFirstName}, got it, thank you! Reading ${who}'s profile now and will come back to you shortly.

Three quick questions that help me match faster:
• Do they need US visa sponsorship?
• Where do they want to be (SF, NY, elsewhere), and are they open to relocating?
• What base range are they targeting?

Best,
Lily`,
  }
}
