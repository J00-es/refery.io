import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { companiesAccessDenied } from '@/lib/admin-auth'

export async function POST(request: Request) {
  const denied = await companiesAccessDenied()
  if (denied) return denied
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { companies } = await request.json()

    if (!Array.isArray(companies) || companies.length === 0) {
      return NextResponse.json({ error: 'No companies provided' }, { status: 400 })
    }

    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[]
    }

    for (const company of companies) {
      try {
        // Check if company already exists
        const { data: existing } = await supabase
          .from('companies')
          .select('id')
          .ilike('name', company.name)
          .single()

        if (existing) {
          results.failed++
          results.errors.push(`${company.name}: Company already exists`)
          continue
        }

        const { error } = await supabase.from('companies').insert({
          name: company.name,
          website: company.website || null,
          description: company.description || null,
          industry: company.industry || null,
          stage: company.stage || null,
          location: company.location || null,
          employee_count: company.employee_count || null,
          linkedin_url: company.linkedin_url || null,
          relationship_status: 'not_contacted',
          created_by_user_id: user.id
        })

        if (error) {
          results.failed++
          results.errors.push(`${company.name}: ${error.message}`)
        } else {
          results.success++
        }
      } catch (err) {
        results.failed++
        results.errors.push(`${company.name || 'Unknown'}: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }

    return NextResponse.json(results)
  } catch (error) {
    console.error('Batch upload error:', error)
    return NextResponse.json({ error: 'Failed to process upload' }, { status: 500 })
  }
}
