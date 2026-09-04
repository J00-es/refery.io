import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { companiesAccessDenied } from '@/lib/admin-auth'

export async function GET() {
  const denied = await companiesAccessDenied()
  if (denied) return denied
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: companies, error } = await supabase
    .from('companies')
    .select('*')
    .order('name', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(companies)
}

export async function POST(req: Request) {
  const denied = await companiesAccessDenied()
  if (denied) return denied
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()

  const { data: company, error } = await supabase
    .from('companies')
    .insert({
      ...body,
      created_by_user_id: user.id,
    })
    .select()
    .single()

  if (error) {
    // 23505 = unique violation on companies_name_domain_uniq: a company with
    // this name and website already exists. That is a client error, not a 500.
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'A company with this name and website already exists' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(company)
}
