import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { Candidate, Job } from '@/lib/types'

const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']

// Job category definitions for matching
const JOB_CATEGORIES: Record<string, { 
  primary: string[];
  secondary: string[];
}> = {
  engineering: {
    primary: ['engineer', 'developer', 'software', 'backend', 'frontend', 'fullstack', 'full-stack', 'devops', 'sre', 'architect', 'programmer', 'tech lead', 'cto'],
    secondary: ['react', 'node', 'python', 'java', 'javascript', 'typescript', 'golang', 'rust', 'c++', 'kubernetes', 'docker', 'aws', 'api'],
  },
  product: {
    primary: ['product manager', 'product owner', 'product lead', 'head of product', 'vp product', 'cpo', 'pm'],
    secondary: ['roadmap', 'user research', 'a/b testing', 'metrics', 'okr', 'stakeholder'],
  },
  design: {
    primary: ['designer', 'ux', 'ui', 'user experience', 'product designer', 'design lead', 'creative director'],
    secondary: ['figma', 'sketch', 'adobe', 'prototype', 'wireframe', 'design system'],
  },
  data: {
    primary: ['data scientist', 'data analyst', 'data engineer', 'machine learning', 'ml engineer', 'ai engineer', 'analytics'],
    secondary: ['python', 'sql', 'tableau', 'spark', 'tensorflow', 'pytorch', 'statistics'],
  },
  customer_success: {
    primary: ['customer success', 'customer support', 'support engineer', 'account manager', 'client success', 'customer service'],
    secondary: ['zendesk', 'intercom', 'salesforce', 'crm', 'nps', 'csat'],
  },
  marketing: {
    primary: ['marketing', 'growth', 'brand', 'content', 'seo', 'sem', 'demand gen'],
    secondary: ['google analytics', 'hubspot', 'campaign', 'acquisition', 'funnel'],
  },
  sales: {
    primary: ['sales', 'account executive', 'business development', 'bdr', 'sdr', 'sales manager'],
    secondary: ['salesforce', 'outreach', 'quota', 'pipeline', 'closing'],
  },
  operations: {
    primary: ['operations', 'ops', 'logistics', 'supply chain', 'coo', 'bizops'],
    secondary: ['process', 'efficiency', 'vendor', 'automation'],
  },
  hr: {
    primary: ['hr', 'human resources', 'people operations', 'recruiter', 'talent acquisition'],
    secondary: ['workday', 'greenhouse', 'lever', 'onboarding'],
  },
  finance: {
    primary: ['finance', 'accounting', 'financial', 'cfo', 'controller', 'fp&a'],
    secondary: ['excel', 'quickbooks', 'netsuite', 'gaap', 'budgeting'],
  },
}

// Category incompatibility map
const INCOMPATIBLE_CATEGORIES: Record<string, string[]> = {
  engineering: ['customer_success', 'sales', 'marketing', 'hr', 'finance'],
  product: ['customer_success', 'sales', 'hr', 'finance'],
  design: ['customer_success', 'sales', 'hr', 'finance', 'engineering'],
  data: ['customer_success', 'sales', 'hr'],
  customer_success: ['engineering', 'design', 'data', 'product', 'finance'],
  marketing: ['engineering', 'design', 'data', 'finance', 'hr'],
  sales: ['engineering', 'design', 'data', 'finance', 'hr', 'product'],
  operations: ['engineering', 'design'],
  hr: ['engineering', 'design', 'data', 'finance', 'sales', 'marketing'],
  finance: ['engineering', 'design', 'customer_success', 'marketing', 'hr'],
}

function getJobCategory(job: Job): string[] {
  const titleLower = (job.title || '').toLowerCase()
  const deptLower = (job.department || '').toLowerCase()
  const categories: string[] = []

  for (const [category, config] of Object.entries(JOB_CATEGORIES)) {
    if (config.primary.some(kw => titleLower.includes(kw) || deptLower.includes(kw))) {
      categories.push(category)
    }
  }
  
  return categories.length > 0 ? categories : ['general']
}

function getCandidateCategory(candidate: Candidate): string[] {
  const categories: string[] = []
  const skillsLower = (candidate.skills || []).map(s => s.toLowerCase())
  
  // Check parsed data for work history
  const parsedData = candidate.parsed_data as { work_history?: { title: string }[] } | null
  const titles = parsedData?.work_history?.map(w => w.title.toLowerCase()) || []
  
  for (const [category, config] of Object.entries(JOB_CATEGORIES)) {
    // Check work history titles
    if (titles.some(title => config.primary.some(kw => title.includes(kw)))) {
      categories.push(category)
      continue
    }
    // Check skills
    if (skillsLower.some(skill => config.primary.some(kw => skill.includes(kw)) || config.secondary.some(kw => skill.includes(kw)))) {
      categories.push(category)
    }
  }
  
  return categories.length > 0 ? categories : ['general']
}

interface MatchResult {
  overall_score: number
  skills_score: number
  experience_score: number
  keywords_score: number
  location_score: number
  salary_score: number
}

function calculateMatchScore(job: Job, candidate: Candidate): MatchResult | null {
  const jobCategories = getJobCategory(job)
  const candidateCategories = getCandidateCategory(candidate)
  
  // Check for incompatibility first
  for (const candCat of candidateCategories) {
    const incompatible = INCOMPATIBLE_CATEGORIES[candCat] || []
    if (jobCategories.some(jc => incompatible.includes(jc))) {
      return null // Hard filter - incompatible categories
    }
  }

  // Skills match (30% weight -> scale to 0-100)
  let skillsScore = 50
  if (job.skills_required?.length && candidate.skills?.length) {
    const jobSkillsLower = job.skills_required.map(s => s.toLowerCase())
    const candidateSkillsLower = candidate.skills.map(s => s.toLowerCase())
    const matchingSkills = jobSkillsLower.filter(js => 
      candidateSkillsLower.some(cs => cs.includes(js) || js.includes(cs))
    ).length
    skillsScore = Math.round((matchingSkills / job.skills_required.length) * 100)
  }
  
  // Experience match (25% weight -> scale to 0-100)
  let experienceScore = 50
  if (candidate.experience_years) {
    const minExp = job.experience_years_min || 0
    const maxExp = job.experience_years_max || minExp + 5
    const diff = candidate.experience_years - minExp
    if (diff >= 0 && candidate.experience_years <= maxExp + 2) {
      experienceScore = 100
    } else if (diff > 0 && diff <= 5) {
      experienceScore = 85
    } else if (diff < 0 && diff >= -2) {
      experienceScore = 70
    } else if (diff < -2) {
      experienceScore = 40
    } else {
      experienceScore = 60
    }
  }
  
  // Keywords match (20% weight) - based on category alignment
  let keywordsScore = 50
  const categoryMatch = candidateCategories.some(cc => jobCategories.includes(cc))
  if (categoryMatch) {
    keywordsScore = 90
  } else if (jobCategories.includes('general') || candidateCategories.includes('general')) {
    keywordsScore = 60
  } else {
    keywordsScore = 30
  }
  if (candidate.skills && candidate.skills.length > 10) keywordsScore = Math.min(100, keywordsScore + 10)
  
  // Location match (15% weight -> scale to 0-100)
  let locationScore = 50
  if (job.remote_policy === 'remote') {
    locationScore = 100
  } else if (job.location && candidate.location) {
    const jobLoc = job.location.toLowerCase()
    const candLoc = candidate.location.toLowerCase()
    if (candLoc.includes(jobLoc) || jobLoc.includes(candLoc)) {
      locationScore = 100
    } else if (candLoc.includes('bay area') && jobLoc.includes('san francisco') ||
               candLoc.includes('san francisco') && jobLoc.includes('bay area') ||
               candLoc.includes('nyc') && jobLoc.includes('new york') ||
               candLoc.includes('new york') && jobLoc.includes('nyc')) {
      locationScore = 95
    } else {
      locationScore = 40
    }
  } else if (job.remote_policy === 'hybrid') {
    locationScore = 70
  }
  
  // Salary match (10% weight)
  let salaryScore = 60
  if (job.salary_min && job.salary_max && candidate.experience_years) {
    if (candidate.experience_years >= 8) {
      salaryScore = job.salary_max >= 180000 ? 90 : 60
    } else if (candidate.experience_years >= 5) {
      salaryScore = job.salary_max >= 140000 ? 85 : 65
    } else {
      salaryScore = 80
    }
  }
  
  // Calculate overall score (weighted average)
  const overallScore = Math.round(
    (skillsScore * 0.30) +
    (experienceScore * 0.25) +
    (keywordsScore * 0.20) +
    (locationScore * 0.15) +
    (salaryScore * 0.10)
  )
  
  if (overallScore < 30) return null

  return {
    overall_score: overallScore,
    skills_score: skillsScore,
    experience_score: experienceScore,
    keywords_score: keywordsScore,
    location_score: locationScore,
    salary_score: salaryScore,
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params
  const supabase = await createClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get user role
  const { data: adminData } = await supabase
    .from('users_admin')
    .select('role')
    .eq('email', user.email)
    .single()
  
  const userRole = SUPER_ADMIN_EMAILS.includes(user.email || '') 
    ? 'super_admin' 
    : adminData?.role || 'viewer'
  const isAdmin = ['super_admin', 'admin'].includes(userRole)

  // Fetch the job
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .single()

  if (jobError || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  // Fetch candidates based on role
  let candidatesQuery = supabase
    .from('candidates')
    .select('*')
    .limit(500) // Limit to prevent performance issues

  if (!isAdmin) {
    // Non-admins only see their own candidates
    candidatesQuery = candidatesQuery.or(
      `owner_user_id.eq.${user.id},uploaded_by_user_id.eq.${user.id},user_id.eq.${user.id}`
    )
  }

  const { data: candidates, error: candError } = await candidatesQuery

  if (candError) {
    return NextResponse.json({ error: candError.message }, { status: 500 })
  }

  // Calculate match scores for all candidates
  const matches = (candidates || [])
    .map(candidate => {
      const scores = calculateMatchScore(job as Job, candidate as Candidate)
      if (!scores) return null
      
      return {
        id: `${jobId}-${candidate.id}`,
        job_id: jobId,
        candidate_id: candidate.id,
        overall_score: scores.overall_score,
        skills_score: scores.skills_score,
        experience_score: scores.experience_score,
        keywords_score: scores.keywords_score,
        location_score: scores.location_score,
        salary_score: scores.salary_score,
        created_at: new Date().toISOString(),
        candidate: candidate,
      }
    })
    .filter((m): m is NonNullable<typeof m> => m !== null)
    .sort((a, b) => b.overall_score - a.overall_score)
    .slice(0, 50) // Return top 50 matches

  return NextResponse.json({ matches })
}
