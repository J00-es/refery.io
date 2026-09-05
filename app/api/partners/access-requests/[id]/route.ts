import { NextResponse } from 'next/server'
import { after } from 'next/server'
import { resolvePartnerAccess } from '@/lib/partners-access'
import { decideAccessRequest, noteDecisionInSlack } from '@/lib/access-requests'

/**
 * Deciding an access request from the web.
 *
 * Same code path as a Slack reaction (lib/access-requests.ts): approving grants
 * the assignment in the same step and emails the partner, so an approved request
 * can never leave someone waiting on a second action nobody remembers to take.
 * The card in Slack gets a thread note so the two surfaces never disagree.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await resolvePartnerAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.canUseDesk) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!access.canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  const decision = body?.status

  if (decision !== 'approved' && decision !== 'denied') {
    return NextResponse.json({ error: 'status must be approved or denied' }, { status: 400 })
  }

  const result = await decideAccessRequest({ id, decision, decidedBy: access.realUser.id, via: 'web' })

  if (!result.ok) {
    if (result.reason === 'not_found') return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (result.reason === 'already_decided') {
      return NextResponse.json({ error: 'That request has already been decided.' }, { status: 409 })
    }
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  const who = access.realUser.fullName?.split(' ')[0] || 'Refery'
  after(() =>
    noteDecisionInSlack(
      id,
      result.decision === 'approved'
        ? `:+1: ${who} approved on the web. ${result.partnerName} is on ${result.companyName}${result.emailed ? ' and has been emailed.' : `, but the email did not send: ${result.emailError ?? 'unknown'}.`}`
        : `:-1: ${who} declined on the web.${result.emailed ? ` ${result.partnerName} has been told.` : ` The email to ${result.partnerName} did not send: ${result.emailError ?? 'unknown'}.`}`,
    ),
  )

  return NextResponse.json({ ok: true, status: decision, emailed: result.emailed })
}
