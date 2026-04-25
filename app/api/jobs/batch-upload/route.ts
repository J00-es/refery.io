import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { jobs } = await request.json()

    if (!Array.isArray(jobs) || jobs.length === 0) {
      return NextResponse.json({ error: 'No jobs provided' }, { status: 400 })
    }

    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[]
    }

    for (const job of jobs) {
      try {
        // Parse requirements, benefits, skills from pipe-separated strings
        const requirements = job.requirements ? job.requirements.split('|').map((r: string) => r.trim()) : []
        const benefits = job.benefits ? job.benefits.split('|').map((b: string) => b.trim()) : []
        const skills = job.skills ? job.skills.split('|').map((s: string) => s.trim()) : []

        const { error } = await supabase.from('jobs').insert({
          title: job.title,
          company: job.company,
          department: job.department || null,
          location: job.location || null,
          employment_type: job.employment_type || 'full-time',
          experience_level: job.experience_level || 'mid',
          salary_min: job.salary_min ? parseInt(job.salary_min) : null,
          salary_max: job.salary_max ? parseInt(job.salary_max) : null,
          description: job.description || '',
          requirements,
          benefits,
          skills,
          visa_requirement: job.visa_requirement || null,
          status: 'active',
          created_by_user_id: user.id,
          owner_user_id: user.id
        })

        if (error) {
          results.failed++
          results.errors.push(`${job.title}: ${error.message}`)
        } else {
          results.success++
        }
      } catch (err) {
        results.failed++
        results.errors.push(`${job.title || 'Unknown'}: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }

    return NextResponse.json(results)
  } catch (error) {
    console.error('Batch upload error:', error)
    return NextResponse.json({ error: 'Failed to process upload' }, { status: 500 })
  }
}
