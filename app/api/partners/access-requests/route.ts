import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolvePartnerAccess } from '@/lib/partners-access'

/**
 * A scout asking to be put on a client.
 *
 * The anonymised card exists so a scout can judge whether a client is worth
 * their time; without this it would be a dead end and they would have to guess
 * who to email. The request carries an optional note, because "I have three
 * people for this" is the thing that gets it approved.
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
    .from('client_companies')
    .select('company_id, is_published')
    .eq('company_id', companyId)
    .maybeSingle()

  if (!company?.is_published) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (access.assignedCompanyIds.has(companyId)) {
    return NextResponse.json({ error: 'You already have access to this client.' }, { status: 409 })
  }

  const { error } = await adminClient
    .from('company_access_requests')
    .insert({ company_id: companyId, user_id: access.appUser.id, message })

  // 23505 is the partial unique index on pending requests — asking twice is not
  // an error worth surfacing as one.
  if (error && error.code !== '23505') {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, pending: true })
}
