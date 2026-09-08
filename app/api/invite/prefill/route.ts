import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { preferencesFromApplication } from '@/lib/onboarding/decisions'
import type { ScoutApplication } from '@/lib/intake'

export const dynamic = 'force-dynamic'

const CITY_LABELS: Record<string, string> = {
  'san francisco / bay area': 'San Francisco',
  'san francisco': 'San Francisco',
  'new york': 'New York',
  'los angeles': 'Los Angeles',
  seattle: 'Seattle',
  boston: 'Boston',
  austin: 'Austin',
  chicago: 'Chicago',
  'denver / boulder': 'Denver / Boulder',
  miami: 'Miami',
  london: 'London',
  toronto: 'Toronto',
}

/**
 * What an invitation token knows about the person, so sign-up can be
 * prefilled. Public, keyed by an unguessable token, and it returns nothing
 * that was not typed by the person themselves on the application form.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')?.trim()
  if (!token) return NextResponse.json({ error: 'missing token' }, { status: 400 })

  const admin = createAdminClient()
  const { data: app } = await admin
    .from('scout_applications')
    .select('*')
    .eq('invite_token', token)
    .in('status', ['approved', 'in_conversation', 'onboarded'])
    .maybeSingle()
  if (!app) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const a = app as ScoutApplication & { contribution_mode: string | null; status: string }
  const p = preferencesFromApplication(a)
  const cities = p.network_cities.map(c => CITY_LABELS[c.toLowerCase()] ?? c).filter((c, i, arr) => arr.indexOf(c) === i)
  const stages = p.stages.map(s => (s === 'seed' ? 'Seed' : s === 'series a' ? 'Series A' : s === 'series b' ? 'Series B' : 'Later'))

  return NextResponse.json({
    fullName: a.full_name,
    email: a.email,
    linkedinUrl: a.linkedin_url,
    kind: a.contribution_mode === 'recruit' ? 'recruiter' : 'scout',
    alreadyOnboarded: a.status === 'onboarded',
    preferences: {
      own_location: '',
      network_cities: cities,
      functions: p.functions,
      stages: [...new Set(stages)],
      relationship_types: (a.hiring_roles ?? []).some(r => /recruit|agency/i.test(r)) ? ['I recruit professionally'] : a.has_hired ? ["I've hired or managed them"] : [],
      would_relocate: false,
    },
  })
}
