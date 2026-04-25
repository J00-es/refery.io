import { NextRequest, NextResponse } from 'next/server'
import { generateText, Output } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { Job, Candidate, MatchScores } from '@/lib/types'

const MatchScoresSchema = z.object({
  overall_score: z.number().min(0).max(100),
  skills_score: z.number().min(0).max(100),
  experience_score: z.number().min(0).max(100),
  keywords_score: z.number().min(0).max(100),
  location_score: z.number().min(0).max(100),
  salary_score: z.number().min(0).max(100),
  reasoning: z.string()
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { candidate_id, job_ids } = await request.json()

    if (!candidate_id || !job_ids || !Array.isArray(job_ids)) {
      return NextResponse.json({ error: 'Missing candidate_id or job_ids' }, { status: 400 })
    }

    // Get candidate data
    const { data: candidate, error: candidateError } = await supabase
      .from('candidates')
      .select('*')
      .eq('id', candidate_id)
      .single()

    if (candidateError || !candidate) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
    }

    // Get jobs data
    const { data: jobs, error: jobsError } = await supabase
      .from('jobs')
      .select('*')
      .in('id', job_ids)
      .eq('status', 'open')

    if (jobsError || !jobs || jobs.length === 0) {
      return NextResponse.json({ error: 'No open jobs found' }, { status: 404 })
    }

    const matches: Array<{ job_id: string; scores: MatchScores }> = []

    // Score each job match
    for (const job of jobs as Job[]) {
      const { output } = await generateText({
        model: 'openai/gpt-4o',
        output: Output.object({ schema: MatchScoresSchema }),
        messages: [
          {
            role: 'system',
            content: `You are an expert technical recruiter AI. Your job is to score how well a candidate matches a job opening.

Score each category from 0-100:
- skills_score: How well do the candidate's skills match the required skills? (Weight: 30%)
- experience_score: Does their experience level match requirements? (Weight: 25%)
- keywords_score: Do they have relevant industry keywords/certifications? (Weight: 20%)
- location_score: Does their location/remote preference align with the job? (Weight: 15%)
- salary_score: Do their salary expectations fit the job's range? (Weight: 10%)

Calculate overall_score as the weighted average.

Be objective and thorough. Provide a brief reasoning explaining the match quality.`
          },
          {
            role: 'user',
            content: `
## Job Details
Title: ${job.title}
Department: ${job.department || 'Not specified'}
Location: ${job.location || 'Not specified'}
Remote Policy: ${job.remote_policy || 'Not specified'}
Required Skills: ${job.skills_required?.join(', ') || 'Not specified'}
Experience Required: ${job.experience_years_min}-${job.experience_years_max || '+'} years
Salary Range: $${job.salary_min?.toLocaleString() || 'Not specified'} - $${job.salary_max?.toLocaleString() || 'Not specified'}
Description: ${job.description}
Requirements: ${job.requirements?.join('; ') || 'Not specified'}

## Candidate Profile
Name: ${(candidate as Candidate).name}
Skills: ${(candidate as Candidate).skills?.join(', ') || 'Not specified'}
Experience: ${(candidate as Candidate).experience_years || 'Not specified'} years
Location: ${(candidate as Candidate).location || 'Not specified'}
Remote Preference: ${(candidate as Candidate).remote_preference || 'Not specified'}
Salary Expectations: $${(candidate as Candidate).salary_expectation_min?.toLocaleString() || 'Not specified'} - $${(candidate as Candidate).salary_expectation_max?.toLocaleString() || 'Not specified'}

Please score this candidate for this job opening.`
          }
        ]
      })

      if (output) {
        matches.push({ job_id: job.id, scores: output })

        // Save match to database
        await supabase.from('job_matches').upsert({
          job_id: job.id,
          candidate_id: candidate_id,
          overall_score: output.overall_score,
          skills_score: output.skills_score,
          experience_score: output.experience_score,
          keywords_score: output.keywords_score,
          location_score: output.location_score,
          salary_score: output.salary_score,
          ai_reasoning: output.reasoning
        }, {
          onConflict: 'job_id,candidate_id'
        })
      }
    }

    return NextResponse.json({ matches })
  } catch (error) {
    console.error('Match error:', error)
    return NextResponse.json({ error: 'Failed to match candidate' }, { status: 500 })
  }
}
