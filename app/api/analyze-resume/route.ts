import { NextRequest, NextResponse } from 'next/server'
import { generateText, Output } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { get } from '@vercel/blob'

const ParsedResumeSchema = z.object({
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  skills: z.array(z.string()),
  experience_years: z.number(),
  location: z.string().nullable(),
  remote_preference: z.string().nullable(),
  salary_expectation_min: z.number().nullable(),
  salary_expectation_max: z.number().nullable(),
  summary: z.string(),
  work_history: z.array(z.object({
    company: z.string(),
    title: z.string(),
    duration: z.string(),
    description: z.string()
  })),
  education: z.array(z.object({
    institution: z.string(),
    degree: z.string(),
    field: z.string(),
    year: z.string()
  })),
  certifications: z.array(z.string())
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { pathname } = await request.json()

    if (!pathname) {
      return NextResponse.json({ error: 'Missing pathname' }, { status: 400 })
    }

    // Get the PDF content from blob storage
    const result = await get(pathname, { access: 'private' })
    
    if (!result) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    // Convert stream to buffer
    const chunks: Uint8Array[] = []
    const reader = result.stream.getReader()
    
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }
    
    const buffer = Buffer.concat(chunks)
    const base64 = buffer.toString('base64')

    // Use GPT-4 to analyze the resume
    const { output } = await generateText({
      model: 'openai/gpt-4o',
      output: Output.object({ schema: ParsedResumeSchema }),
      system: `You are an expert technical recruiter AI assistant. Your job is to analyze resumes and extract structured information.

Extract the following from the resume:
- Full name
- Contact information (email, phone)
- Technical and soft skills as an array
- Total years of professional experience (estimate based on work history)
- Location (city, state/country)
- Remote work preference (if mentioned: "remote", "hybrid", "onsite", or null)
- Salary expectations (if mentioned, in USD)
- A brief professional summary
- Work history with company names, job titles, durations, and descriptions
- Education history
- Certifications

Be accurate and extract only what is explicitly stated or can be reasonably inferred. Return null for fields that cannot be determined.`,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: base64,
              mediaType: 'application/pdf'
            },
            {
              type: 'text',
              text: 'Please analyze this resume and extract the structured information.'
            }
          ]
        }
      ]
    })

    return NextResponse.json({ parsed_data: output })
  } catch (error) {
    console.error('Resume analysis error:', error)
    
    // Check for specific AI Gateway errors
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    if (errorMessage.includes('credit card') || errorMessage.includes('customer_verification_required')) {
      return NextResponse.json({ 
        error: 'AI service requires account verification. Please add a credit card to your Vercel account to unlock AI features.',
        code: 'VERIFICATION_REQUIRED'
      }, { status: 402 })
    }
    
    if (errorMessage.includes('rate limit') || errorMessage.includes('quota')) {
      return NextResponse.json({ 
        error: 'AI service rate limit reached. Please try again later.',
        code: 'RATE_LIMIT'
      }, { status: 429 })
    }
    
    return NextResponse.json({ error: 'Failed to analyze resume. Please try again.' }, { status: 500 })
  }
}
