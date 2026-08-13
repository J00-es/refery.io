/**
 * Checks for the pure parts of the inbound-résumé path.
 *
 *     npx tsx lib/inbound-resume.check.ts
 *
 * There is no test runner in this project, so this is a plain script that exits
 * non-zero on failure. It covers the two things that are expensive to get wrong
 * and impossible to eyeball: which attachments are classified as résumés (a
 * false negative silently loses a candidate) and webhook signature
 * verification (a false positive lets anyone on the internet create records).
 *
 * The example senders and filenames are real ones from the inbox this feature
 * was built for.
 */

import { parseFromHeader, skipReason, looksLikeResume } from '@/lib/inbound-resume'
import { verifyResendSignature, signResendPayload } from '@/lib/resend-webhook'

let failures = 0
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        got:      ${JSON.stringify(actual)}\n        expected: ${JSON.stringify(expected)}`}`)
}

// --- From header parsing (real headers from Lily's inbox) ---
check('From with display name', parseFromHeader('Febin Francis <febin.francis@404hires.com>'), {
  email: 'febin.francis@404hires.com',
  name: 'Febin Francis',
})
check('From, bare address', parseFromHeader('leithrobertson8@gmail.com'), {
  email: 'leithrobertson8@gmail.com',
  name: null,
})
check('From, quoted name + mixed case', parseFromHeader('"Joo, Lily" <Lily@Refery.IO>'), {
  email: 'lily@refery.io',
  name: 'Joo, Lily',
})
check('From, empty', parseFromHeader(null), { email: '', name: null })

// --- Pre-filter ---
const email = (from: string) => ({
  providerEmailId: 'e1',
  messageId: null,
  fromEmail: from,
  fromName: null,
  subject: 'x',
  receivedAt: null,
  origin: 'https://refery.xyz',
})
const att = (filename: string, extra: Partial<{ size: number; contentType: string }> = {}) => ({
  id: 'a1',
  filename,
  contentType: extra.contentType ?? 'application/pdf',
  downloadUrl: 'https://example.test/x',
  size: extra.size ?? 100_000,
})

check('keeps a recruiter CV', skipReason(email('febin.francis@404hires.com'), att('Natalia Correa_CV 2026.pdf')), null)
check('keeps a candidate self-send', skipReason(email('leithrobertson8@gmail.com'), att('resume.pdf')), null)
check('drops our own agreements mailbox', skipReason(email('agreements@refery.io'), att('signed.pdf')) !== null, true)
check('drops Google Workspace invoices', skipReason(email('payments-noreply@google.com'), att('invoice.pdf')) !== null, true)
check('drops Stripe receipts', skipReason(email('invoice+statements@stripe.com'), att('receipt.pdf')) !== null, true)
check('drops no-reply senders', skipReason(email('no-reply@somewhere.com'), att('thing.pdf')) !== null, true)
check('drops an agreement by filename even from a partner', skipReason(email('febin.francis@404hires.com'), att('Refery NDA signed.pdf')) !== null, true)
check('drops non-PDFs', skipReason(email('someone@gmail.com'), att('photo.png', { contentType: 'image/png' })) !== null, true)
check('drops oversized files', skipReason(email('someone@gmail.com'), att('big.pdf', { size: 11 * 1024 * 1024 })) !== null, true)
check('keeps a file with "Resume" in the name', skipReason(email('ayushisinhahaha@gmail.com'), att('AI Product Ayushi Sinha Resume 2026.pdf')), null)

// --- Post-parse validation ---
check('accepts a real parse', looksLikeResume({ name: 'Natalia Correa', work_history: [{ company: 'Acme', title: 'AE' } as never], education: [], skills: ['Sales', 'Outbound', 'Salesforce'] }), true)
check('rejects an invoice-shaped parse', looksLikeResume({ name: 'Google Workspace', work_history: [], education: [], skills: [] }), false)
check('rejects a nameless parse', looksLikeResume({ name: null as never, work_history: [{} as never] }), false)
check('rejects "Unknown"', looksLikeResume({ name: 'Unknown', work_history: [{ company: 'x' } as never] }), false)
check('rejects an education-only stub with no skills', looksLikeResume({ name: 'Someone', work_history: [], education: [{ institution: 'MIT' } as never], skills: [] }), false)

// --- Webhook signature ---
const SECRET = 'whsec_' + Buffer.from('a-test-signing-secret-of-some-length').toString('base64')
const BODY = JSON.stringify({ type: 'email.received', data: { email_id: 'abc' } })
const NOW = 1_770_000_000_000
const TS = Math.floor(NOW / 1000)
const good = signResendPayload('msg_1', TS, BODY, SECRET)

check('accepts a correctly signed delivery', verifyResendSignature({ id: 'msg_1', timestamp: String(TS), signature: good }, BODY, SECRET, NOW), null)
check('accepts when one of several signatures matches (key rotation)', verifyResendSignature({ id: 'msg_1', timestamp: String(TS), signature: `v1,${Buffer.from('wrong').toString('base64')} ${good}` }, BODY, SECRET, NOW), null)
check('rejects a tampered body', verifyResendSignature({ id: 'msg_1', timestamp: String(TS), signature: good }, BODY.replace('abc', 'xyz'), SECRET, NOW), 'signature mismatch')
check('rejects a different message id (replay onto another delivery)', verifyResendSignature({ id: 'msg_2', timestamp: String(TS), signature: good }, BODY, SECRET, NOW), 'signature mismatch')
check('rejects the wrong secret', verifyResendSignature({ id: 'msg_1', timestamp: String(TS), signature: good }, BODY, 'whsec_' + Buffer.from('different-secret').toString('base64'), NOW), 'signature mismatch')
check('rejects a stale timestamp', verifyResendSignature({ id: 'msg_1', timestamp: String(TS - 600), signature: good }, BODY, SECRET, NOW), 'timestamp outside tolerance')
check('rejects a future timestamp', verifyResendSignature({ id: 'msg_1', timestamp: String(TS + 600), signature: good }, BODY, SECRET, NOW), 'timestamp outside tolerance')
check('rejects missing headers', verifyResendSignature({ id: null, timestamp: null, signature: null }, BODY, SECRET, NOW), 'missing signature headers')
check('rejects a header with no v1 entry', verifyResendSignature({ id: 'msg_1', timestamp: String(TS), signature: 'v2,abc' }, BODY, SECRET, NOW), 'no v1 signature in header')
check('rejects a malformed timestamp', verifyResendSignature({ id: 'msg_1', timestamp: 'not-a-number', signature: good }, BODY, SECRET, NOW), 'malformed timestamp')

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
