/**
 * Post (or re-post) a submission's Slack card from the command line.
 *
 *   npx tsx scripts/resend-submission-card.ts <submission id>
 *
 * Reads the same environment the app does (.env.local), so run it from the
 * repo root. Exists because the admin button on the page is the normal way,
 * and this is the way when nobody is at the page.
 */

import { announceSubmission } from '../lib/desk-notifications'

async function main() {
  const id = process.argv[2]
  if (!id) {
    console.error('usage: npx tsx scripts/resend-submission-card.ts <submission id>')
    process.exit(2)
  }
  const result = await announceSubmission(id)
  console.log(result.sent ? `card posted for ${id}` : `card NOT posted: ${result.error ?? 'unknown error'}`)
  process.exit(result.sent ? 0 : 1)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
