/**
 * The two replies sent when an intake row is approved from Slack.
 *
 * Copy is lifted from what Lily already sends by hand, so an approved applicant
 * cannot tell the difference between the automated reply and the manual one.
 * Plain text only, for the same reason: a templated HTML shell would announce
 * itself as bulk mail on an email whose whole job is to read as personal.
 */

import { Resend } from 'resend'

const FROM = 'Lily Joo <lily@refery.io>'
const CALL_LINK = 'cal.com/refery-lily/15'

function firstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0]
  return first || 'there'
}

export interface OutboundEmail {
  subject: string
  text: string
}

export function scoutApplicationEmail(fullName: string): OutboundEmail {
  return {
    subject: `[Refery] Scout Application | ${fullName.trim()}`,
    text: [
      `Hi ${firstName(fullName)},`,
      '',
      `Lily from Refery! Saw that you're interested in becoming a scout for Refery. :)`,
      '',
      'Happy to meet you and get to know you better.',
      '',
      `${CALL_LINK} works?`,
      '',
      'Best,',
      'Lily',
    ].join('\n'),
  }
}

export function hiringLeadEmail(
  fullName: string,
  companyName: string,
  rolesHiringFor: string | null,
): OutboundEmail {
  // The roles line only earns its place when they actually told us something;
  // a generic "whatever you're hiring for" reads worse than saying nothing.
  const roles = (rolesHiringFor ?? '').trim()
  const rolesLine = roles
    ? `You mentioned ${roles}, and that sits right in what our network covers.`
    : `Would be good to hear which roles are open and where the gaps are.`

  return {
    subject: `[Refery] ${companyName.trim()} / Lily :)`,
    text: [
      `Hi ${firstName(fullName)},`,
      '',
      `Lily from Refery! Saw you're hiring at ${companyName.trim()}. :)`,
      '',
      'We work with a network of scouts and independent recruiters who bring people',
      'out of their own networks, so you see profiles that are not sitting on job',
      'boards or applying anywhere else.',
      '',
      rolesLine,
      '',
      `Happy to do a quick call. ${CALL_LINK} works?`,
      '',
      'Best,',
      'Lily',
    ].join('\n'),
  }
}

export async function sendIntakeEmail(
  to: string,
  email: OutboundEmail,
): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { sent: false, error: 'RESEND_API_KEY not set' }

  try {
    const resend = new Resend(apiKey)
    const res = await resend.emails.send({
      from: FROM,
      to,
      replyTo: 'lily@refery.io',
      subject: email.subject,
      text: email.text,
    })
    if (res.error) {
      return { sent: false, error: res.error.message || JSON.stringify(res.error) }
    }
    return { sent: true }
  } catch (err) {
    return { sent: false, error: (err as Error).message }
  }
}
