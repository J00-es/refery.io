import { NextResponse } from 'next/server'
import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolvePartnerAccess } from '@/lib/partners-access'
import { announceAccessRequest } from '@/lib/access-requests'

/**
 * A scout asking to be put on a client.
 *
 * The anonymised card exists so a scout can judge whether a client is worth
 * their time; without this it would be a dead end and they would have to guess
 * who to email. The request carries an optional note, because "I have three
 * people for this" is the thing that gets it approved.
 *
 * The row becomes a card in Slack that Lily decides with :+1: or :-1:, so the
 * request is answered the same day instead of waiting for someone to open
 * /searches/requests. See lib/access-requests.ts.
 */
export async function POST(req: Request) {
  const access = await resolvePartnerAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.canUseDesk) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const companyId = typeof body?.company_id === 'string' ? body.company_id : null
  const message =
    typeof body?.message === 'string' && body.message.trim() ? body.message.trim().slice(0, 1000) : null

  if (!companyId) return NextResponse.json({ error: 'company_id is required' }, { status: 400 })

  const adminClient = createAdminClient()

  // Only published partner companies can be requested. Anything else is not
  // visible to this user in the first place, so confirming it exists would leak
  // the client list.
  const { data: company } = await adminClient
    .from('partner_companies_v')
    .select('company_id, is_published, company_name, live_roles')
    .eq('company_id', companyId)
    .maybeSingle()

  if (!company?.is_published) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (access.assignedCompanyIds.has(companyId)) {
    return NextResponse.json({ error: 'You already have access to this client.' }, { status: 409 })
  }

  const { data: inserted, error } = await adminClient
    .from('company_access_requests')
    .insert({ company_id: companyId, user_id: access.appUser.id, message })
    .select('id')
    .maybeSingle()

  // 23505 is the partial unique index on pending requests — asking twice is not
  // an error worth surfacing as one, and there is already a card for it.
  if (error && error.code !== '23505') {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (inserted?.id) {
    const requestId = inserted.id as string
    const partner = access.appUser
    // Slack is two calls and a write; the partner should not wait on it.
    after(() =>
      announceAccessRequest({
        requestId,
        partnerName: partner.fullName?.trim() || partner.email,
        partnerEmail: partner.email,
        partnerRole: partner.role,
        companyName: (company.company_name as string | null) ?? 'a client',
        liveRoles: Number(company.live_roles ?? 0),
        message,
      }).then(r => {
        if (!r.sent) console.warn('[access-requests] slack card not sent:', r.error)
      }),
    )
  }

  return NextResponse.json({ ok: true, pending: true })
}
