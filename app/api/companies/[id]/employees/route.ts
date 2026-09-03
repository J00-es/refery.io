import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { companiesAccessDenied } from '@/lib/admin-auth'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await companiesAccessDenied()
  if (denied) return denied
  const { id } = await params
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: employees, error } = await supabase
    .from('company_employees')
    .select('*')
    .eq('company_id', id)
    .order('name', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(employees)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await companiesAccessDenied()
  if (denied) return denied
  const { id } = await params
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()

  const { data: employee, error } = await supabase
    .from('company_employees')
    .insert({
      ...body,
      company_id: id,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(employee)
}
