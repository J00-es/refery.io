import type { SupabaseClient } from '@supabase/supabase-js'
import { AGREEMENT_VERSIONS } from '@/lib/agreements'

/**
 * Submission Terms gate.
 *
 * Partner Terms v2.0 deliberately leaves attribution, candidate consent and
 * indemnity out of the sign-up document, because none of those obligations
 * exist until there is a candidate. They bind here instead, once, before a
 * partner's first submission.
 *
 * Partners who joined on the older scout or recruiter agreements are not asked.
 * Those documents already contain all of this, so prompting them would be
 * asking people to re-accept terms they are already bound by.
 */

export const SUBMISSION_TERMS_TYPE = 'partner_submission'

const PARTNER_ROLES = ['scout', 'recruiter']

export interface SubmissionTermsStatus {
  required: boolean
  accepted: boolean
}

export async function getSubmissionTermsStatus(
  admin: SupabaseClient,
  user: { id: string; email: string; role: string },
): Promise<SubmissionTermsStatus> {
  if (!PARTNER_ROLES.includes(user.role)) {
    return { required: false, accepted: true }
  }

  const { data: rows, error } = await admin
    .from('agreement_acceptances')
    .select('agreement_type, agreement_version')
    .eq('user_id', user.id)

  if (error) {
    // Never block a submission because the check itself failed.
    console.error('[submission-terms] lookup failed:', error)
    return { required: false, accepted: true }
  }

  const acceptances = rows ?? []

  if (acceptances.some((r) => r.agreement_type === SUBMISSION_TERMS_TYPE)) {
    return { required: true, accepted: true }
  }

  // Only partners on the split document owe these terms separately.
  const onSplitTerms = acceptances.some(
    (r) =>
      PARTNER_ROLES.includes(r.agreement_type ?? '') &&
      r.agreement_version === AGREEMENT_VERSIONS.partner,
  )

  return { required: onSplitTerms, accepted: !onSplitTerms }
}
