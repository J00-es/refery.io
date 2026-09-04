import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { companiesAccessDenied } from '@/lib/admin-auth'

/**
 * Reduce a website to its bare host so it can be compared for identity.
 * Mirrors the expression used by the companies_name_domain_uniq index:
 * strip protocol, strip leading "www.", keep the host only.
 */
function normalizeDomain(website?: string | null): string {
  return (website ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .replace(/\.+$/, '')
}

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
        // A company is a duplicate only when the name AND the domain match.
        // Matching on name alone is wrong: unrelated businesses share names
        // (e.g. two different "Circle Health" companies).
        //
        // NB: do not use .single() here - it errors when 2+ rows match, and a
        // discarded error meant the check silently passed and inserted yet
        // another copy. That is what compounded duplicates historically.
        const { data: sameName, error: lookupError } = await supabase
          .from('companies')
          .select('id, website')
          .ilike('name', company.name)

        if (lookupError) {
          results.failed++
          results.errors.push(`${company.name}: lookup failed - ${lookupError.message}`)
          continue
        }

        const incomingDomain = normalizeDomain(company.website)
        const existing = (sameName ?? []).find(
          (row) => normalizeDomain(row.website) === incomingDomain
        )

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
          // 23505 = unique violation. The DB has a unique index on
          // (lower(trim(name)), domain-of-website) as a backstop against the
          // race where two uploads insert the same company concurrently.
          results.errors.push(
            error.code === '23505'
              ? `${company.name}: Company already exists`
              : `${company.name}: ${error.message}`
          )
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
