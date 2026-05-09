import { NextResponse } from 'next/server'
import { generateText } from 'ai'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { type, mode, jobId, candidateIds, hiringManagerName, companyName, candidateId, jobIds } = body

    if (type === 'hiring_manager') {
      // Fetch job and candidates
      const { data: job } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', jobId)
        .single()

      const { data: candidates } = await supabase
        .from('candidates')
        .select('*')
        .in('id', candidateIds)

      if (!job || !candidates) {
        return NextResponse.json({ error: 'Job or candidates not found' }, { status: 404 })
      }

      // Build candidate summaries
      const candidateSummaries = candidates.map(c => {
        const parsed = c.parsed_data as { summary?: string; work_history?: Array<{ title: string; company: string }> } | null

        if (mode === 'anonymized') {
          return {
            title: parsed?.work_history?.[0]?.title || 'Professional',
            experience: c.experience_years || 'N/A',
            skills: c.skills?.slice(0, 5).join(', ') || 'Various',
            summary: parsed?.summary?.slice(0, 200) || '',
          }
        } else {
          return {
            name: c.name,
            title: parsed?.work_history?.[0]?.title || 'Professional',
            experience: c.experience_years || 'N/A',
            skills: c.skills?.slice(0, 5).join(', ') || 'Various',
            summary: parsed?.summary?.slice(0, 200) || '',
            linkedin: c.linkedin_url || null,
            email: c.email,
          }
        }
      })

      const prompt = mode === 'anonymized' 
        ? `Generate a professional cold outreach email to a hiring manager about potential candidates for their open role.

Role: ${job.title} at ${companyName || job.company_name || 'the company'}
Hiring Manager: ${hiringManagerName || 'Hiring Manager'}

Candidates (anonymized - DO NOT include names, just describe their profiles):
${candidateSummaries.map((c, i) => `
Candidate ${i + 1}:
- Current/Recent Role: ${c.title}
- Experience: ${c.experience} years
- Key Skills: ${c.skills}
- Summary: ${c.summary}
`).join('\n')}

Write a brief, professional email that:
1. Introduces yourself as a recruiter partner
2. Mentions you have ${candidates.length} strong candidate(s) for their ${job.title} role
3. Provides a brief anonymized overview of each candidate without names
4. Asks if they'd like to learn more or schedule a call

Keep it concise and professional. Do not include placeholder brackets.`
        : `Generate a professional email to share candidate profiles with a hiring manager.

Role: ${job.title} at ${companyName || job.company_name || 'the company'}
Hiring Manager: ${hiringManagerName || 'Hiring Manager'}

Candidates:
${candidateSummaries.map((c, i) => `
${i + 1}. ${c.name}
- Current/Recent Role: ${c.title}
- Experience: ${c.experience} years
- Key Skills: ${c.skills}
- LinkedIn: ${c.linkedin || 'N/A'}
- Summary: ${c.summary}
`).join('\n')}

Write a professional email that:
1. Introduces the candidates you're sharing
2. Provides a brief overview of each with their name and qualifications
3. Mentions LinkedIn profiles and that resumes are attached
4. Offers to schedule interviews or provide more information

Keep it professional and actionable. Do not include placeholder brackets.`

      const { text } = await generateText({
        model: 'openai/gpt-4o',
        prompt,
      })

      return NextResponse.json({ 
        email: text,
        subject: mode === 'anonymized' 
          ? `Strong Candidates for ${job.title} Role`
          : `Candidate Profiles: ${candidates.map(c => c.name).join(', ')} for ${job.title}`,
        candidates: mode === 'anonymized' ? null : candidates,
      })

    } else if (type === 'candidate_opportunities') {
      // Fetch candidate and jobs
      const { data: candidate } = await supabase
        .from('candidates')
        .select('*')
        .eq('id', candidateId)
        .single()

      const { data: jobs } = await supabase
        .from('jobs')
        .select('*')
        .in('id', jobIds)

      if (!candidate || !jobs) {
        return NextResponse.json({ error: 'Candidate or jobs not found' }, { status: 404 })
      }

      // Format salary for display
      const formatSalary = (min: number | null, max: number | null) => {
        if (min && max) return `$${(min/1000).toFixed(0)}K - $${(max/1000).toFixed(0)}K`
        if (min) return `From $${(min/1000).toFixed(0)}K`
        if (max) return `Up to $${(max/1000).toFixed(0)}K`
        return 'Competitive'
      }

      // Format visa requirement
      const formatVisa = (visa: string | null) => {
        const labels: Record<string, string> = {
          us_citizen_only: 'US Citizens/Green Card holders only',
          us_authorized: 'Must be authorized to work in US',
          sponsorship_available: 'Visa sponsorship available',
          no_restriction: 'Open to all work authorizations',
        }
        return visa ? labels[visa] || '' : ''
      }

      const prompt = `Generate a professional, warm email to a candidate about job opportunities that match their profile.

Candidate: ${candidate.name}

Job Opportunities:
${jobs.map((j, i) => `
${i + 1}. ${j.title} at ${j.company_name || 'Company'}
- Location: ${j.location || 'Remote/Flexible'}
- Remote Policy: ${j.remote_policy || 'Flexible'}
- Salary Range: ${formatSalary(j.salary_min, j.salary_max)}
- Company Stage: ${j.company_stage?.replace('-', ' ').toUpperCase() || 'N/A'}
- Visa: ${formatVisa(j.visa_requirement)}
- Job URL: ${j.job_post_url || 'Available upon request'}
- Key Skills: ${j.skills_required?.slice(0, 5).join(', ') || 'Various'}
- About: ${j.description?.slice(0, 150) || ''}
`).join('\n')}

Write a personalized email that:
1. Addresses the candidate by first name (${candidate.name.split(' ')[0]})
2. Explains you have ${jobs.length} exciting opportunity/opportunities matching their background
3. For EACH role, include:
   - The role title and company
   - Location and remote policy
   - Salary range (important!)
   - A clickable link to the job posting if available
   - Why it might be a good fit based on their skills
4. Includes a clear call to action asking which roles interest them

Make it warm, enthusiastic, but professional. Include the job links naturally in the text.`

      const { text } = await generateText({
        model: 'openai/gpt-4o',
        prompt,
      })

      return NextResponse.json({ 
        email: text,
        subject: `${jobs.length} Exciting Opportunit${jobs.length > 1 ? 'ies' : 'y'} Matching Your Profile`,
        jobs,
      })
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })

  } catch (error) {
    console.error('Email generation error:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    if (errorMessage.includes('credit card') || errorMessage.includes('customer_verification_required')) {
      return NextResponse.json({ 
        error: 'AI service requires account verification.',
        code: 'VERIFICATION_REQUIRED'
      }, { status: 402 })
    }
    
    return NextResponse.json({ error: 'Failed to generate email' }, { status: 500 })
  }
}
