import { redirect } from 'next/navigation'

/**
 * Retired. Scouts and recruiters have accepted one shared document, Partner
 * Terms, since v2.0, and that is what sign-up actually shows. These two routes
 * kept publishing the superseded Recruiting Partner Agreement, which quoted
 * terms that no longer match what anyone signs. Both now land on the live
 * document.
 *
 * The old text still lives in lib/agreements.ts so the partners who signed it
 * resolve to what they signed. It is just no longer published as current.
 */
export default function Page() {
  redirect('/partner-terms')
}
