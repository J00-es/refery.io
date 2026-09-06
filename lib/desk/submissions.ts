/**
 * A desk decision about a person is also a decision about every search they
 * were submitted to through Searches. This keeps role_submissions in step so
 * the partner's Pipeline says the same thing as the candidate page and the
 * Sunday digest, and the submission card in Slack gets the line.
 *
 *   not_fit    every open submission becomes "not moving forward", with the
 *              reason the partner already read in the email
 *   intro_now  submissions for the seats Lily named become "shortlisted"
 *   bench      unchanged; the seat may still be live, only nothing fits today
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { esc, postThreadReply } from '@/lib/slack-bot'

const OPEN = ['submitted', 'shortlisted']

export async function syncSubmissions(
  admin: SupabaseClient,
  input: { candidateId: string; decision: 'intro_now' | 'bench' | 'not_fit'; jobIds: string[]; reason: string | null; by: string },
): Promise<{ moved: number }> {
  if (input.decision === 'bench') return { moved: 0 }
  const { data: subs } = await admin
    .from('role_submissions')
    .select('id, job_id, status, slack_channel_id, slack_message_ts')
    .eq('candidate_id', input.candidateId)
    .in('status', OPEN)
  const now = new Date().toISOString()
  let moved = 0
  for (const s of subs ?? []) {
    let to: 'declined' | 'shortlisted' | null = null
    if (input.decision === 'not_fit') to = 'declined'
    else if (input.decision === 'intro_now' && input.jobIds.includes(s.job_id as string) && s.status === 'submitted') to = 'shortlisted'
    if (!to) continue
    const patch: Record<string, unknown> = { status: to, reviewed_at: now, updated_at: now, slack_decline_pending_at: null }
    if (to === 'declined') {
      patch.decided_at = now
      patch.decline_reason = input.reason ?? 'Not a fit for the searches we have open right now.'
      patch.review_note = patch.decline_reason
    } else patch.review_note = 'Lily asked for the warm intro.'
    const { data: claimed } = await admin.from('role_submissions').update(patch).eq('id', s.id).eq('status', s.status).select('id')
    if (!claimed?.length) continue
    moved++
    await admin.from('role_submission_events').insert({ submission_id: s.id, from_status: s.status, to_status: to, note: String(patch.review_note), actor_user_id: null })
    if (s.slack_channel_id && s.slack_message_ts) {
      await postThreadReply(
        s.slack_channel_id as string,
        s.slack_message_ts as string,
        to === 'declined'
          ? `:no_entry: Declined from the candidate desk (${esc(input.by)}). The partner reads this reason on the search and in Sunday's digest:\n>${esc(String(patch.decline_reason))}`
          : `:star: Shortlisted from the candidate desk (${esc(input.by)}): Lily asked the partner for the warm intro.`,
      )
    }
  }
  return { moved }
}
