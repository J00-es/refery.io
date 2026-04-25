import { NextResponse } from 'next/server'
import { generateText, Output } from 'ai'
import { z } from 'zod'

const ParsedJobSchema = z.object({
  title: z.string().describe('Job title'),
  company_name: z.string().nullable().describe('Company name'),
  department: z.string().nullable().describe('Department or team'),
  location: z.string().nullable().describe('Job location (city, state, country)'),
  remote_policy: z.enum(['remote', 'hybrid', 'onsite']).nullable().describe('Remote work policy'),
  description: z.string().describe('Full job description - comprehensive summary'),
  requirements: z.array(z.string()).nullable().describe('List of job requirements as separate items'),
  skills_required: z.array(z.string()).nullable().describe('Required technical and soft skills as individual items'),
  experience_years_min: z.number().describe('Minimum years of experience required (default 0 if entry-level)'),
  experience_years_max: z.number().nullable().describe('Maximum years of experience if specified'),
  salary_min: z.number().nullable().describe('Minimum salary in USD annually'),
  salary_max: z.number().nullable().describe('Maximum salary in USD annually'),
  company_stage: z.enum(['seed', 'series-a', 'series-b', 'series-c', 'series-d', 'public', 'established']).nullable().describe('Company funding stage if identifiable'),
  tags: z.array(z.string()).nullable().describe('Relevant tags: role level (junior/senior/lead), domain (frontend/backend/fullstack), industry'),
  visa_requirement: z.enum(['us_citizen_only', 'us_authorized', 'sponsorship_available', 'no_restriction']).nullable().describe('Visa/work authorization requirement'),
  referral_bonus: z.number().nullable().describe('Referral bonus amount if mentioned'),
  hiring_manager_name: z.string().nullable().describe('Hiring manager or recruiter name if mentioned'),
  hiring_manager_email: z.string().nullable().describe('Contact email for the role if mentioned'),
  benefits: z.array(z.string()).nullable().describe('List of benefits mentioned (healthcare, equity, 401k, etc.)'),
  team_size: z.string().nullable().describe('Team size or company size if mentioned'),
  reporting_to: z.string().nullable().describe('Who this role reports to if mentioned'),
})

export async function POST(req: Request) {
  try {
    const { url } = await req.json()

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    // Fetch the job page content
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ReferyBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    })

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch job page' }, { status: 400 })
    }

    const html = await response.text()

    // Clean HTML - remove scripts, styles, and get text content
    const cleanedContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 15000) // Limit content length for AI

    // Use AI to extract job information
    const { output } = await generateText({
      model: 'openai/gpt-4o',
      output: Output.object({ schema: ParsedJobSchema }),
      system: `You are an expert at extracting structured job posting information from webpage content. Your goal is to extract as much useful information as possible to minimize manual data entry.

EXTRACTION RULES:
- Be thorough - extract ALL available information from the posting
- For salary: Convert to USD annually. If hourly, multiply by 2080. If monthly, multiply by 12.
- For experience: Default to 0 for entry-level/junior roles. Look for phrases like "5+ years" or "3-5 years"
- Remote policy: Look for "remote", "hybrid", "on-site", "in-office", "work from home", "WFH"
- Skills: Extract EACH skill separately (e.g., ["Python", "React", "AWS"] not ["Python/React/AWS"])
- Requirements: Split into individual requirements, not one big paragraph
- Visa/Authorization: Look for "US citizen", "authorized to work", "visa sponsorship", "H1B", "green card"
  - "Must be authorized to work in US" = us_authorized
  - "US citizen or green card holder" = us_citizen_only  
  - "Visa sponsorship available" = sponsorship_available
  - No mention or "open to all" = no_restriction
- Company stage: Identify from context - "seed stage startup", "Series B funded", "Fortune 500", "established company"
- Tags: Include role level (junior/mid/senior/lead/staff/principal), domain, tech stack highlights
- Benefits: Extract healthcare, equity, PTO, 401k, parental leave, etc.
- Look for referral bonuses, signing bonuses, or equity grants`,
      prompt: `Extract job posting information from this webpage content:

URL: ${url}

Content:
${cleanedContent}`,
    })

    return NextResponse.json({ 
      parsed_data: output,
      source_url: url,
    })
  } catch (error) {
    console.error('Job URL parsing error:', error)
    
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    if (errorMessage.includes('credit card') || errorMessage.includes('customer_verification_required')) {
      return NextResponse.json({ 
        error: 'AI service requires account verification. Please add a credit card to your Vercel account.',
        code: 'VERIFICATION_REQUIRED'
      }, { status: 402 })
    }
    
    return NextResponse.json({ error: 'Failed to parse job URL' }, { status: 500 })
  }
}
