import { describe, expect, it } from 'vitest'
import { effectiveSpec } from '@/lib/sourcing/brief'
import { evidenceInRecord } from '@/lib/sourcing/grade'
import { effectiveCap, forecast } from '@/lib/sourcing/mailboxes'
import { contactStatusOf, mergeEmails, pickAddress } from '@/lib/sourcing/people'
import { inWindow, timezoneFor } from '@/lib/sourcing/send'
import { DEFAULT_STEPS, mergeFields, renderDrafts, unresolved } from '@/lib/sourcing/sequence'
import { returnDate } from '@/lib/sourcing/sync'
import { isReady, notReadyBecause, type BriefRow, type MailboxRow, type PersonEmail, type PersonRow, type SequenceRow } from '@/lib/sourcing/types'

const now = '2026-09-12T10:00:00.000Z'

const person = (over: Partial<PersonRow> = {}): PersonRow => ({
  id: 'p1',
  full_name: 'Priya Natarajan',
  first_name: 'Priya',
  last_name: 'Natarajan',
  headline: null,
  current_title: 'Software Engineer II',
  current_employer: 'Twitch',
  employer_domain: 'twitch.tv',
  location: 'San Francisco, CA',
  relocation: 'unknown',
  links: {},
  emails: [],
  history: [],
  education: [],
  facts: [],
  apollo_id: null,
  specter_id: null,
  candidate_id: null,
  do_not_contact: false,
  do_not_contact_reason: null,
  last_contacted_at: null,
  last_enriched_at: now,
  enrichment_credits: 0,
  created_at: now,
  updated_at: now,
  ...over,
})

const mailbox = (over: Partial<MailboxRow> = {}): MailboxRow => ({
  id: 'm1',
  address: 'lily@refery.io',
  display_name: 'Lily Joo',
  signs_as: 'Lily',
  owner_email: null,
  credential: { kind: 'desk' },
  daily_cap: 10,
  cap_ceiling: 50,
  ramp_step: 5,
  ramp_started_at: null,
  reserved_other: 0,
  status: 'active',
  last_error: null,
  last_sync_at: null,
  last_sync_ok: null,
  last_history_id: null,
  created_at: now,
  updated_at: now,
  ...over,
})

describe('ready means all four at once', () => {
  it('needs fit, an address, a clear relationship and the decision', () => {
    expect(isReady({ fit_status: 'fit', contact_status: 'found', relationship_status: 'clear', decision: 'ready' })).toBe(true)
    expect(isReady({ fit_status: 'near_miss', contact_status: 'verified', relationship_status: 'clear', decision: 'ready' })).toBe(false)
    expect(isReady({ fit_status: 'fit', contact_status: 'guessed', relationship_status: 'clear', decision: 'ready' })).toBe(false)
    expect(isReady({ fit_status: 'fit', contact_status: 'verified', relationship_status: 'client_employee', decision: 'ready' })).toBe(false)
    expect(isReady({ fit_status: 'fit', contact_status: 'verified', relationship_status: 'clear', decision: 'none' })).toBe(false)
  })
  it('says why, in the order a reader fixes things', () => {
    expect(notReadyBecause({ fit_status: 'unknown', contact_status: 'none', relationship_status: 'unchecked', decision: 'none' })).toEqual(['not read yet', 'no email', 'checks not run', 'no decision'])
    expect(notReadyBecause({ fit_status: 'fit', contact_status: 'guessed', relationship_status: 'contacted_recently', decision: 'held' })).toEqual(['email is a guess', 'contacted recently', 'held'])
  })
})

describe('emails on a person', () => {
  const e = (address: string, status: PersonEmail['status'], kind: PersonEmail['kind'] = 'work'): PersonEmail => ({ address, status, kind, source: 't', checked_at: null })
  it('merges by address and a bounce always sticks', () => {
    const merged = mergeEmails([e('a@x.com', 'bounced')], [e('A@x.com', 'verified'), e('b@x.com', 'found')])
    expect(merged.find(x => x.address === 'a@x.com')?.status).toBe('bounced')
    expect(merged).toHaveLength(2)
  })
  it('ranks contact status without counting a bounce', () => {
    expect(contactStatusOf([e('a@x.com', 'bounced')])).toBe('none')
    expect(contactStatusOf([e('a@x.com', 'guessed'), e('b@x.com', 'found')])).toBe('found')
    expect(contactStatusOf([e('a@x.com', 'verified')])).toBe('verified')
  })
  it('picks by preference and never a bounced one', () => {
    const emails = [e('work@co.com', 'verified', 'work'), e('me@gmail.com', 'found', 'personal'), e('old@gmail.com', 'bounced', 'personal')]
    expect(pickAddress(emails, 'personal_first')?.address).toBe('me@gmail.com')
    expect(pickAddress(emails, 'work_first')?.address).toBe('work@co.com')
    expect(pickAddress(emails, 'work_only')?.address).toBe('work@co.com')
    expect(pickAddress([e('me@gmail.com', 'found', 'personal')], 'work_only')).toBeNull()
  })
})

describe('the hook must rest on the record', () => {
  it('accepts an evidence line that is in the record and rejects one that is not', () => {
    const record = 'HISTORY:\n- Software Engineer II at Twitch (2024 to now): owned the low-latency HLS playback path for the web player'
    expect(evidenceInRecord('owned the low-latency HLS playback path for the web player', record)).toBe(true)
    expect(evidenceInRecord('wrote the React Native bridge for the iOS app', record)).toBe(false)
    expect(evidenceInRecord(null, record)).toBe(false)
  })
})

describe('drafts', () => {
  it('renders every merge field and flags a missing one', () => {
    const fields = mergeFields(person(), { hook: 'I found you through hls-lite.', hook_ok: true }, { jobId: 'j', companyName: 'Alcor Labs', title: 'Founding Full-Stack Engineer', location: 'Burlingame', remotePolicy: 'onsite', payLine: '$180k to 240k base' }, mailbox())
    const drafts = renderDrafts(DEFAULT_STEPS, fields)
    expect(drafts[0].subject).toBe('Founding Full-Stack Engineer at Alcor Labs')
    expect(drafts[0].body).toContain('Hi Priya,')
    expect(drafts[0].body).toContain('I found you through hls-lite.')
    expect(drafts[0].body).toContain('$180k to 240k base, onsite in Burlingame')
    expect(drafts[0].body).toContain('reply "no thanks"')
    expect(drafts[1].day).toBe(4)
    expect(unresolved(drafts)).toEqual([])
    expect(unresolved(renderDrafts([{ n: 1, day: 0, subject: '{title}', body: 'Hi {first}, {founder_name} says hi' }], fields))).toEqual(['founder_name'])
  })
  it('opens plainly when the hook was not verified', () => {
    const fields = mergeFields(person(), { hook: 'A flattering guess.', hook_ok: false }, { jobId: 'j', companyName: 'Alcor', title: 'Engineer', location: null, remotePolicy: null, payLine: 'competitive pay' }, mailbox())
    expect(fields.opener).toBe('I came across your profile, Software Engineer II at Twitch, and thought of a search I am running.')
  })
})

describe('brief overrides ride on top of every version', () => {
  const brief = (): BriefRow => ({
    id: 'b',
    job_id: 'j',
    version: 2,
    status: 'approved',
    spec: {
      who: 'An engineer.',
      requirements: [
        { key: 'react_native', label: 'React Native with native bridges', mandatory: true, detail: null, sources: [] },
        { key: 'realtime', label: 'Real-time systems in production', mandatory: true, detail: null, sources: [] },
      ],
      signals: [],
      not_for: [],
      titles: ['Software Engineer'],
      employers: [{ name: 'Twitch', domain: 'twitch.tv', why: 'player team' }],
      keywords: [],
      locations: ['San Francisco, CA'],
      years: { min: 2, max: 5 },
      onsite: 'onsite',
      open_with: 'Lead with the work.',
      questions: [],
      market: null,
    },
    sources: [],
    changes: null,
    overrides: [
      { path: 'requirements.react_native.mandatory', value: false, by: 'lily', at: now, reason: 'client said willingness is enough' },
      { path: 'requirements.realtime', value: null, by: 'lily', at: now, reason: null },
      { path: 'who', value: 'A builder.', by: 'lily', at: now, reason: null },
      { path: 'titles', value: ['Software Engineer', 'Full Stack Engineer'], by: 'lily', at: now, reason: null },
    ],
    model: null,
    approved_by: null,
    approved_at: null,
    created_by: null,
    created_at: now,
    updated_at: now,
  })
  it('flips, removes and rewrites without touching the stored spec', () => {
    const b = brief()
    const spec = effectiveSpec(b)
    expect(spec.requirements).toHaveLength(1)
    expect(spec.requirements[0].mandatory).toBe(false)
    expect(spec.who).toBe('A builder.')
    expect(spec.titles).toEqual(['Software Engineer', 'Full Stack Engineer'])
    expect(b.spec.requirements).toHaveLength(2)
    expect(b.spec.who).toBe('An engineer.')
  })
})

describe('mailbox capacity', () => {
  it('ramps by weekdays and stops at the ceiling', () => {
    expect(effectiveCap(mailbox())).toBe(10)
    const long = mailbox({ ramp_started_at: new Date(Date.now() - 60 * 86_400_000).toISOString() })
    expect(effectiveCap(long)).toBe(50)
    const capped = mailbox({ daily_cap: 60, cap_ceiling: 50 })
    expect(effectiveCap(capped)).toBe(50)
  })
  it('forecasts honestly: every send counts, first emails only on send days', () => {
    const f = forecast([mailbox({ daily_cap: 50, reserved_other: 10 }), mailbox({ id: 'm2', address: 'kim@getrefery.com', daily_cap: 20 })], { steps: 2, sendDays: 3 })
    expect(f.sendsPerMonth).toBe((40 + 20) * 22)
    expect(f.firstEmailsPerMonth).toBe(60 * 13)
    expect(f.peoplePerMonth).toBe(Math.min(60 * 13, Math.floor((60 * 22) / 2)))
  })
})

describe('send windows', () => {
  const seq = (): SequenceRow => ({
    id: 's',
    job_id: 'j',
    version: 1,
    steps: DEFAULT_STEPS,
    mailbox_ids: [],
    address_preference: 'personal_first',
    send_days: [2, 3, 4],
    followup_days: [1, 2, 3, 4, 5],
    window_start: '08:30',
    window_end: '11:00',
    mode: 'learning',
    sending: true,
    created_at: now,
    updated_at: now,
  })
  it('sends first emails only on send days inside the morning window, in the seat time zone', () => {
    // Tuesday 15 September 2026, 16:00 UTC = 09:00 in Los Angeles.
    const tueMorningLA = new Date('2026-09-15T16:00:00Z')
    expect(inWindow(seq(), 0, 'America/Los_Angeles', tueMorningLA).ok).toBe(true)
    // Same instant is 18:00 in Madrid: outside the window.
    expect(inWindow(seq(), 0, 'Europe/Madrid', tueMorningLA).ok).toBe(false)
    // Monday is not a send day for first emails, but follow-ups go.
    const monLA = new Date('2026-09-14T16:00:00Z')
    expect(inWindow(seq(), 0, 'America/Los_Angeles', monLA).ok).toBe(false)
    expect(inWindow(seq(), 1, 'America/Los_Angeles', monLA).ok).toBe(true)
    // Saturday: nothing.
    expect(inWindow(seq(), 1, 'America/Los_Angeles', new Date('2026-09-19T16:00:00Z')).ok).toBe(false)
  })
  it('guesses the time zone from the seat location', () => {
    expect(timezoneFor('SF Bay Area (Burlingame)')).toBe('America/Los_Angeles')
    expect(timezoneFor('Barcelona, Spain')).toBe('Europe/Madrid')
    expect(timezoneFor('New York City')).toBe('America/New_York')
  })
})

describe('out of office', () => {
  it('reads a return date and falls back to a week', () => {
    const base = new Date('2026-09-12T10:00:00Z')
    expect(returnDate('I am out of the office and will be back on 16 September with limited access.', base).toISOString().slice(0, 10)).toBe('2026-09-16')
    expect(returnDate('Out of office until Sep 21', base).toISOString().slice(0, 10)).toBe('2026-09-21')
    expect(returnDate('Automatic reply: away, thanks for your patience', base).toISOString().slice(0, 10)).toBe('2026-09-19')
  })
})
