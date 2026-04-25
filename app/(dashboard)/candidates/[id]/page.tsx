import { createClient, createAdminClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import type { Candidate, JobMatch, Job, ParsedResumeData } from '@/lib/types'
import { AVAILABILITY_STATUSES } from '@/lib/types'
import { CandidateAvailabilityStatus } from '@/components/candidate-availability-status'
import { CandidateActions } from '@/components/candidate-actions'
import { MatchDetailCard } from '@/components/match-detail-card'
import { RecruiterNotes } from '@/components/recruiter-notes'
import { CandidateActivityLog } from '@/components/candidate-activity-log'
import { SendOpportunitiesButton } from '@/components/send-opportunities-button'
import { CandidateOwnerAssignment } from '@/components/candidate-owner-assignment'
import { Linkedin, Clock, Calendar, Briefcase, ArrowRight, User, UserPlus, Sparkles, Brain } from 'lucide-react'
import { CandidateVerdict } from '@/components/candidate-verdict'

interface PageProps {
  params: Promise<{ id: string }>
}

// ═══════════════════════════════════════════════════════════════════════════════
// WORLD-CLASS JOB MATCHING ALGORITHM v2.0
// Designed to match candidates with surgical precision - no irrelevant matches
// ═══════════════════════════════════════════════════════════════════════════════

// Comprehensive category definitions with primary keywords (MUST match) and secondary keywords (boost)
const JOB_CATEGORIES: Record<string, { 
  primary: string[];  // Keywords that DEFINE this category - used for hard filtering
  secondary: string[];  // Keywords that indicate relevance - used for scoring
  incompatible: string[];  // Categories that should NEVER match this one
}> = {
  engineering: {
    primary: ['engineer', 'developer', 'software', 'backend', 'frontend', 'fullstack', 'full-stack', 'full stack', 'devops', 'sre', 'architect', 'programmer', 'coder', 'tech lead', 'engineering manager', 'cto', 'vp engineering', 'head of engineering'],
    secondary: ['react', 'node', 'python', 'java', 'javascript', 'typescript', 'golang', 'rust', 'c++', 'kubernetes', 'docker', 'aws', 'gcp', 'azure', 'api', 'microservices', 'database', 'sql', 'nosql', 'git', 'ci/cd', 'agile', 'scrum'],
    incompatible: ['customer_success', 'sales', 'marketing', 'hr', 'finance', 'legal', 'recruiting'],
  },
  product: {
    primary: ['product manager', 'product owner', 'product lead', 'head of product', 'vp product', 'cpo', 'product director', 'group product manager', 'senior product manager', 'associate product manager', 'apm'],
    secondary: ['roadmap', 'user research', 'a/b testing', 'metrics', 'okr', 'kpi', 'stakeholder', 'prioritization', 'jira', 'confluence', 'figma', 'analytics'],
    incompatible: ['customer_success', 'sales', 'hr', 'finance', 'legal', 'recruiting'],
  },
  design: {
    primary: ['designer', 'ux', 'ui', 'user experience', 'user interface', 'graphic designer', 'visual designer', 'product designer', 'design lead', 'head of design', 'creative director', 'brand designer', 'interaction designer'],
    secondary: ['figma', 'sketch', 'adobe', 'photoshop', 'illustrator', 'prototype', 'wireframe', 'user research', 'design system', 'typography', 'color theory', 'accessibility'],
    incompatible: ['customer_success', 'sales', 'hr', 'finance', 'legal', 'recruiting', 'engineering'],
  },
  data: {
    primary: ['data scientist', 'data analyst', 'data engineer', 'machine learning', 'ml engineer', 'ai engineer', 'analytics engineer', 'bi analyst', 'business intelligence', 'statistician', 'quantitative analyst', 'quant', 'research scientist', 'applied scientist'],
    secondary: ['python', 'r', 'sql', 'tableau', 'looker', 'spark', 'hadoop', 'tensorflow', 'pytorch', 'statistics', 'modeling', 'etl', 'data warehouse', 'bigquery', 'snowflake', 'airflow'],
    incompatible: ['customer_success', 'sales', 'hr', 'legal', 'recruiting'],
  },
  customer_success: {
    primary: ['customer success', 'customer support', 'support engineer', 'support specialist', 'customer experience', 'cx', 'cs manager', 'account manager', 'client success', 'customer service', 'help desk', 'technical support', 'support lead'],
    secondary: ['zendesk', 'intercom', 'salesforce', 'hubspot', 'crm', 'nps', 'csat', 'churn', 'retention', 'onboarding', 'escalation', 'ticketing'],
    incompatible: ['engineering', 'design', 'data', 'product', 'finance', 'legal'],
  },
  marketing: {
    primary: ['marketing', 'growth', 'brand', 'content', 'seo', 'sem', 'social media', 'demand gen', 'performance marketing', 'digital marketing', 'cmo', 'vp marketing', 'marketing manager', 'growth marketer', 'content marketer', 'brand manager'],
    secondary: ['google analytics', 'hubspot', 'mailchimp', 'copywriting', 'campaign', 'acquisition', 'conversion', 'funnel', 'lead generation', 'paid media', 'organic', 'pr', 'communications'],
    incompatible: ['engineering', 'design', 'data', 'finance', 'legal', 'hr'],
  },
  sales: {
    primary: ['sales', 'account executive', 'business development', 'bdr', 'sdr', 'sales rep', 'sales manager', 'sales director', 'vp sales', 'cro', 'enterprise sales', 'inside sales', 'field sales', 'sales engineer', 'solutions engineer', 'pre-sales'],
    secondary: ['salesforce', 'hubspot', 'outreach', 'quota', 'pipeline', 'closing', 'negotiation', 'cold calling', 'prospecting', 'demo', 'contract', 'revenue', 'arr', 'mrr'],
    incompatible: ['engineering', 'design', 'data', 'finance', 'legal', 'hr', 'product'],
  },
  operations: {
    primary: ['operations', 'ops', 'logistics', 'supply chain', 'procurement', 'coo', 'vp operations', 'operations manager', 'business operations', 'strategy operations', 'bizops', 'revenue operations', 'revops'],
    secondary: ['process', 'efficiency', 'vendor', 'inventory', 'fulfillment', 'automation', 'workflow', 'optimization', 'metrics', 'reporting'],
    incompatible: ['engineering', 'design', 'legal'],
  },
  hr: {
    primary: ['hr', 'human resources', 'people operations', 'people ops', 'talent acquisition', 'recruiting', 'recruiter', 'hr manager', 'hr director', 'chro', 'vp people', 'head of people', 'people partner', 'hrbp', 'compensation', 'benefits', 'dei', 'employee experience'],
    secondary: ['workday', 'greenhouse', 'lever', 'ats', 'onboarding', 'performance review', 'culture', 'engagement', 'retention', 'employer brand'],
    incompatible: ['engineering', 'design', 'data', 'finance', 'legal', 'sales', 'marketing'],
  },
  finance: {
    primary: ['finance', 'accounting', 'financial', 'cfo', 'controller', 'fp&a', 'financial analyst', 'accountant', 'bookkeeper', 'treasurer', 'tax', 'audit', 'vp finance', 'finance manager', 'investment', 'investor relations'],
    secondary: ['excel', 'quickbooks', 'netsuite', 'gaap', 'ifrs', 'budgeting', 'forecasting', 'modeling', 'variance', 'reconciliation', 'cash flow', 'p&l', 'balance sheet'],
    incompatible: ['engineering', 'design', 'customer_success', 'marketing', 'hr'],
  },
  legal: {
    primary: ['legal', 'lawyer', 'attorney', 'counsel', 'general counsel', 'gc', 'paralegal', 'compliance', 'contracts', 'corporate counsel', 'litigation', 'ip', 'intellectual property', 'legal ops'],
    secondary: ['contract review', 'negotiation', 'regulatory', 'privacy', 'gdpr', 'nda', 'sla', 'terms of service', 'policy'],
    incompatible: ['engineering', 'design', 'data', 'customer_success', 'marketing', 'hr', 'sales'],
  },
  executive: {
    primary: ['ceo', 'chief executive', 'founder', 'co-founder', 'president', 'managing director', 'general manager', 'gm', 'chief of staff', 'board member', 'c-level', 'c-suite'],
    secondary: ['leadership', 'strategy', 'vision', 'board', 'investor', 'fundraising', 'p&l ownership', 'scale', 'hypergrowth'],
    incompatible: [], // Executives can potentially match with various senior roles
  },
}

// Detect candidate's primary categories with confidence scores
function getCandidateCategory(
  parsedData: ParsedResumeData | null, 
  skills: string[] | null,
  candidateName: string | null
): { category: string; confidence: number }[] {
  const categoryScores: Record<string, number> = {}
  
  // 1. Analyze work history (highest weight - 3x) - focus on recent roles
  if (parsedData?.work_history) {
    parsedData.work_history.forEach((work, index) => {
      const titleLower = work.title.toLowerCase()
      const recencyBonus = Math.max(1, 3 - index * 0.5) // More recent roles get higher weight
      
      for (const [category, config] of Object.entries(JOB_CATEGORIES)) {
        // Primary keywords are worth more
        if (config.primary.some(kw => titleLower.includes(kw))) {
          categoryScores[category] = (categoryScores[category] || 0) + (10 * recencyBonus)
        }
        // Secondary keywords contribute less
        if (config.secondary.some(kw => titleLower.includes(kw))) {
          categoryScores[category] = (categoryScores[category] || 0) + (2 * recencyBonus)
        }
      }
    })
  }
  
  // 2. Analyze skills (medium weight - 2x)
  if (skills) {
    const skillsLower = skills.map(s => s.toLowerCase())
    for (const [category, config] of Object.entries(JOB_CATEGORIES)) {
      const primaryMatches = config.primary.filter(kw => skillsLower.some(s => s.includes(kw))).length
      const secondaryMatches = config.secondary.filter(kw => skillsLower.some(s => s.includes(kw))).length
      
      categoryScores[category] = (categoryScores[category] || 0) + (primaryMatches * 5) + (secondaryMatches * 2)
    }
  }
  
  // 3. Analyze education field if available
  if (parsedData?.education) {
    for (const edu of parsedData.education) {
      const fieldLower = (edu.field || '').toLowerCase()
      if (fieldLower.includes('computer') || fieldLower.includes('software') || fieldLower.includes('electrical')) {
        categoryScores['engineering'] = (categoryScores['engineering'] || 0) + 5
      }
      if (fieldLower.includes('business') || fieldLower.includes('mba')) {
        categoryScores['product'] = (categoryScores['product'] || 0) + 3
        categoryScores['operations'] = (categoryScores['operations'] || 0) + 2
      }
      if (fieldLower.includes('design') || fieldLower.includes('art')) {
        categoryScores['design'] = (categoryScores['design'] || 0) + 5
      }
      if (fieldLower.includes('data') || fieldLower.includes('statistics') || fieldLower.includes('math')) {
        categoryScores['data'] = (categoryScores['data'] || 0) + 5
      }
    }
  }
  
  // Convert to sorted array with confidence scores
  const total = Object.values(categoryScores).reduce((a, b) => a + b, 0) || 1
  return Object.entries(categoryScores)
    .map(([category, score]) => ({ 
      category, 
      confidence: Math.min(1, score / Math.max(total, 20)) // Normalize to 0-1
    }))
    .filter(c => c.confidence > 0.1) // Only include categories with >10% confidence
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3) // Max 3 categories per candidate
}

// Get job's category from title and description
function getJobCategory(job: Job): { category: string; confidence: number }[] {
  const categoryScores: Record<string, number> = {}
  const titleLower = (job.title || '').toLowerCase()
  const descLower = (job.description || '').toLowerCase()
  const deptLower = (job.department || '').toLowerCase()
  const skillsLower = (job.skills_required || []).map(s => s.toLowerCase())
  
  for (const [category, config] of Object.entries(JOB_CATEGORIES)) {
    let score = 0
    
    // Title match is CRITICAL (10x weight)
    if (config.primary.some(kw => titleLower.includes(kw))) {
      score += 100
    }
    
    // Department match (5x weight)
    if (config.primary.some(kw => deptLower.includes(kw))) {
      score += 50
    }
    
    // Skills match
    const skillMatches = config.secondary.filter(kw => skillsLower.some(s => s.includes(kw))).length
    score += skillMatches * 5
    
    // Description match (lower weight - can be noisy)
    if (config.primary.some(kw => descLower.includes(kw))) {
      score += 10
    }
    
    if (score > 0) {
      categoryScores[category] = score
    }
  }
  
  const total = Object.values(categoryScores).reduce((a, b) => a + b, 0) || 1
  return Object.entries(categoryScores)
    .map(([category, score]) => ({ 
      category, 
      confidence: Math.min(1, score / Math.max(total, 50))
    }))
    .filter(c => c.confidence > 0.05)
    .sort((a, b) => b.confidence - a.confidence)
}

// Check if candidate and job are categorically compatible
function areCategoriesCompatible(
  candidateCategories: { category: string; confidence: number }[],
  jobCategories: { category: string; confidence: number }[]
): { compatible: boolean; score: number; reason: string } {
  if (candidateCategories.length === 0 || jobCategories.length === 0) {
    return { compatible: true, score: 0.5, reason: 'Unable to determine categories' }
  }
  
  const primaryCandidateCategory = candidateCategories[0].category
  const primaryJobCategory = jobCategories[0]?.category
  
  // Check if job category is in candidate's incompatible list
  const candidateCategoryConfig = JOB_CATEGORIES[primaryCandidateCategory]
  if (candidateCategoryConfig && candidateCategoryConfig.incompatible.includes(primaryJobCategory)) {
    return { 
      compatible: false, 
      score: 0, 
      reason: `${primaryCandidateCategory} candidates don't match ${primaryJobCategory} roles` 
    }
  }
  
  // Check for direct category match
  const matchingCategories = candidateCategories.filter(cc => 
    jobCategories.some(jc => jc.category === cc.category)
  )
  
  if (matchingCategories.length > 0) {
    const bestMatch = matchingCategories[0]
    const jobMatch = jobCategories.find(jc => jc.category === bestMatch.category)
    return { 
      compatible: true, 
      score: (bestMatch.confidence + (jobMatch?.confidence || 0)) / 2,
      reason: `Strong match in ${bestMatch.category}`
    }
  }
  
  // Check for adjacent/related categories (engineering <-> data, product <-> design, etc.)
  const adjacentCategories: Record<string, string[]> = {
    engineering: ['data', 'product'],
    data: ['engineering', 'product'],
    product: ['design', 'engineering', 'data'],
    design: ['product'],
    marketing: ['sales', 'product'],
    sales: ['marketing', 'customer_success'],
    customer_success: ['sales'],
    operations: ['finance', 'hr'],
    hr: ['operations'],
    finance: ['operations'],
  }
  
  for (const cc of candidateCategories) {
    const adjacent = adjacentCategories[cc.category] || []
    for (const jc of jobCategories) {
      if (adjacent.includes(jc.category)) {
        return { 
          compatible: true, 
          score: (cc.confidence + jc.confidence) / 4, // Lower score for adjacent matches
          reason: `Related fields: ${cc.category} -> ${jc.category}`
        }
      }
    }
  }
  
  // No match and no adjacent match - likely incompatible
  return { 
    compatible: false, 
    score: 0,
    reason: `No category overlap: candidate is ${primaryCandidateCategory}, job is ${primaryJobCategory}`
  }
}

// Extract insights from recruiter notes
function extractRecruiterInsights(notes: string | null): {
  preferredCompanies: string[];
  preferredTechnologies: string[];
  preferredRoleTypes: string[];
  dealbreakers: string[];
  seniority: string | null;
} {
  if (!notes) return { preferredCompanies: [], preferredTechnologies: [], preferredRoleTypes: [], dealbreakers: [], seniority: null }
  
  const notesLower = notes.toLowerCase()
  const insights = {
    preferredCompanies: [] as string[],
    preferredTechnologies: [] as string[],
    preferredRoleTypes: [] as string[],
    dealbreakers: [] as string[],
    seniority: null as string | null,
  }
  
  // Extract company preferences
  const companyPatterns = [
    /(?:interested in|wants|looking for|prefers|likes?|loves?|excited about)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/gi,
    /(?:previously at|worked at|coming from)\s+([A-Z][a-zA-Z]+)/gi,
  ]
  for (const pattern of companyPatterns) {
    let match
    while ((match = pattern.exec(notes)) !== null) {
      insights.preferredCompanies.push(match[1].toLowerCase())
    }
  }
  
  // Extract technology preferences
  const techTerms = ['react', 'node', 'python', 'java', 'typescript', 'golang', 'rust', 'aws', 'gcp', 'azure', 
                     'kubernetes', 'docker', 'terraform', 'frontend', 'backend', 'fullstack', 'mobile', 'ios', 'android', 
                     'devops', 'machine learning', 'ml', 'ai', 'data science', 'blockchain', 'web3', 'crypto']
  for (const term of techTerms) {
    if (notesLower.includes(term)) {
      insights.preferredTechnologies.push(term)
    }
  }
  
  // Extract role type preferences
  const rolePatterns = {
    'startup': ['startup', 'early stage', 'seed', 'series a', 'small team'],
    'enterprise': ['enterprise', 'large company', 'established', 'fortune'],
    'remote': ['remote', 'wfh', 'work from home', 'distributed'],
    'hybrid': ['hybrid', 'in-office', 'onsite'],
    'leadership': ['manager', 'lead', 'director', 'head of', 'vp', 'management'],
    'ic': ['individual contributor', 'ic', 'hands-on', 'coding'],
  }
  for (const [roleType, patterns] of Object.entries(rolePatterns)) {
    if (patterns.some(p => notesLower.includes(p))) {
      insights.preferredRoleTypes.push(roleType)
    }
  }
  
  // Extract dealbreakers
  const dealBreakerPatterns = [
    /(?:doesn't want|won't consider|not interested in|avoid|no)\s+([^.]+)/gi,
    /(?:dealbreaker|deal breaker|red flag):\s*([^.]+)/gi,
  ]
  for (const pattern of dealBreakerPatterns) {
    let match
    while ((match = pattern.exec(notesLower)) !== null) {
      insights.dealbreakers.push(match[1].trim())
    }
  }
  
  // Extract seniority
  if (notesLower.includes('senior') || notesLower.includes('staff') || notesLower.includes('principal')) {
    insights.seniority = 'senior'
  } else if (notesLower.includes('junior') || notesLower.includes('entry level') || notesLower.includes('associate')) {
    insights.seniority = 'junior'
  } else if (notesLower.includes('lead') || notesLower.includes('manager') || notesLower.includes('director')) {
    insights.seniority = 'leadership'
  }
  
  return insights
}

// Main filtering function - WORLD CLASS PRECISION
function filterAndLimitMatches(
  matches: (JobMatch & { job: Job })[],
  candidateCategories: { category: string; confidence: number }[],
  recruiterNotes: string | null,
  candidateSkills: string[] | null,
  candidateExperience: number | null,
  limit: number
): (JobMatch & { job: Job })[] {
  const insights = extractRecruiterInsights(recruiterNotes)
  
  // Score and filter each match
  const scoredMatches = matches.map(match => {
    const job = match.job
    if (!job) return null
    
    // Get job categories
    const jobCategories = getJobCategory(job)
    
    // Check category compatibility - THIS IS THE KEY FILTER
    const compatibility = areCategoriesCompatible(candidateCategories, jobCategories)
    
    // HARD FILTER: Incompatible categories get excluded entirely
    if (!compatibility.compatible) {
      return null
    }
    
    // Calculate relevance score (0-100)
    let relevanceScore = 0
    
    // 1. Category alignment (40 points max)
    relevanceScore += compatibility.score * 40
    
    // 2. Skills match (25 points max)
    if (candidateSkills && job.skills_required) {
      const jobSkillsLower = job.skills_required.map(s => s.toLowerCase())
      const candidateSkillsLower = candidateSkills.map(s => s.toLowerCase())
      const matchingSkills = candidateSkillsLower.filter(cs => 
        jobSkillsLower.some(js => js.includes(cs) || cs.includes(js))
      ).length
      const skillMatchRatio = matchingSkills / Math.max(job.skills_required.length, 1)
      relevanceScore += skillMatchRatio * 25
    }
    
    // 3. Experience alignment (15 points max)
    if (candidateExperience && job.experience_min) {
      const expDiff = candidateExperience - job.experience_min
      if (expDiff >= 0 && expDiff <= 3) {
        relevanceScore += 15 // Perfect range
      } else if (expDiff > 3 && expDiff <= 6) {
        relevanceScore += 10 // Slightly overqualified
      } else if (expDiff < 0 && expDiff >= -2) {
        relevanceScore += 8 // Slightly underqualified
      }
    } else {
      relevanceScore += 7 // Neutral if no data
    }
    
    // 4. Recruiter notes alignment (15 points max)
    let notesScore = 0
    const jobTitleLower = (job.title || '').toLowerCase()
    const jobCompanyLower = (job.company_name || '').toLowerCase()
    const jobDescLower = (job.description || '').toLowerCase()
    
    // Company preferences
    if (insights.preferredCompanies.some(c => jobCompanyLower.includes(c))) {
      notesScore += 8
    }
    
    // Technology preferences
    const techMatches = insights.preferredTechnologies.filter(t => 
      jobTitleLower.includes(t) || jobDescLower.includes(t)
    ).length
    notesScore += Math.min(5, techMatches * 2)
    
    // Dealbreaker check (negative score)
    if (insights.dealbreakers.some(d => jobTitleLower.includes(d) || jobDescLower.includes(d))) {
      notesScore -= 15
    }
    
    relevanceScore += Math.max(0, notesScore)
    
    // 5. Base match score from AI (5 points) - use as minor tiebreaker
    relevanceScore += Math.min(5, (match.overall_score || 0) / 20)
    
    return {
      match,
      relevanceScore,
      jobCategories,
      compatibility,
    }
  }).filter((m): m is NonNullable<typeof m> => m !== null)
  
  // Sort by our calculated relevance score
  scoredMatches.sort((a, b) => b.relevanceScore - a.relevanceScore)
  
  // Return top matches
  return scoredMatches.slice(0, limit).map(m => m.match)
}

const stageColors: Record<string, { bg: string; text: string }> = {
  sourced: { bg: 'bg-slate-100', text: 'text-slate-700' },
  screening: { bg: 'bg-blue-100', text: 'text-blue-700' },
  interview: { bg: 'bg-purple-100', text: 'text-purple-700' },
  offer: { bg: 'bg-amber-100', text: 'text-amber-700' },
  hired: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  rejected: { bg: 'bg-red-100', text: 'text-red-700' },
  withdrawn: { bg: 'bg-gray-100', text: 'text-gray-500' },
}

const stageLabels: Record<string, string> = {
  sourced: 'Sourced',
  screening: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
  hired: 'Hired',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
}

export default async function CandidateDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  const adminClient = createAdminClient()
  
  // Get current user and their role for permission checks first
  const { data: { user } } = await supabase.auth.getUser()
  const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(user?.email || '')
  
  // Use admin client for super admins to bypass RLS
  const dbClient = isSuperAdmin ? adminClient : supabase

  const { data: candidate, error: candidateError } = await dbClient
    .from('candidates')
    .select('*')
    .eq('id', id)
    .single()

  if (candidateError || !candidate) {
    notFound()
  }

  const { data: matches } = await dbClient
    .from('job_matches')
    .select(`
      *,
      job:jobs(*)
    `)
    .eq('candidate_id', id)
    .order('overall_score', { ascending: false })

  // Fetch pipeline data for this candidate
  const { data: pipelineData } = await dbClient
    .from('job_candidate_pipeline')
    .select(`
      *,
      job:jobs(id, title, company_name)
    `)
    .eq('candidate_id', id)
    .order('created_at', { ascending: false })

  // Fetch owner info
  let ownerInfo = null
  if (candidate.owner_user_id) {
    const { data: owner } = await adminClient
      .from('users_admin')
      .select('email, full_name')
      .eq('user_id', candidate.owner_user_id)
      .single()
    ownerInfo = owner
  }

  // Fetch created by info
  let createdByInfo = null
  if (candidate.uploaded_by_user_id) {
    const { data: createdBy } = await adminClient
      .from('users_admin')
      .select('email, full_name')
      .eq('user_id', candidate.uploaded_by_user_id)
      .single()
    createdByInfo = createdBy
  }

  const { data: adminData } = await adminClient
    .from('users_admin')
    .select('role')
    .eq('email', user?.email)
    .single()
  
  const userRole = isSuperAdmin ? 'super_admin' : (adminData?.role || 'viewer')
  const isAdmin = isSuperAdmin || userRole === 'admin'
  const canSetRecruiterVerdict = isSuperAdmin || ['admin', 'recruiter', 'scout'].includes(userRole)

  // Fetch recruiter notes to enhance job matching
  const { data: recruiterNotes } = await dbClient
    .from('recruiter_notes')
    .select('content')
    .eq('candidate_id', id)
    .order('created_at', { ascending: false })
  
  // Combine all notes into a single string for keyword extraction
  const allRecruiterNotes = recruiterNotes?.map(n => n.content).join(' ') || null

  const typedCandidate = candidate as Candidate
  const allMatches = (matches ?? []) as (JobMatch & { job: Job })[]
  const parsedData = typedCandidate.parsed_data as ParsedResumeData | null

  // Determine candidate's category/department from their work history, skills, and name
  const candidateCategories = getCandidateCategory(parsedData, typedCandidate.skills, typedCandidate.name)
  
  // Filter matches using world-class algorithm - HARD FILTERS incompatible categories
  // Also considers recruiter notes, skills alignment, and experience level
  const typedMatches = filterAndLimitMatches(
    allMatches, 
    candidateCategories, 
    allRecruiterNotes, 
    typedCandidate.skills,
    typedCandidate.experience_years,
    10
  )

  const statusColors = {
    new: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
    reviewing: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
    shortlisted: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
    rejected: 'bg-red-500/10 text-red-600 border-red-500/30',
    hired: 'bg-primary/10 text-primary border-primary/30',
  }

  function formatRelativeTime(dateString: string | null) {
    if (!dateString) return null
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
    return date.toLocaleDateString()
  }

  return (
    <div className="space-y-4 sm:space-y-8 px-4 sm:px-0">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 sm:gap-3 mb-2 flex-wrap">
            <h1 className="text-xl sm:text-3xl font-bold tracking-tight text-foreground">{typedCandidate.name}</h1>
            <span className={`rounded-full border px-2 sm:px-3 py-0.5 sm:py-1 text-xs sm:text-sm font-medium capitalize ${statusColors[typedCandidate.status]}`}>
              {typedCandidate.status}
            </span>
            <CandidateAvailabilityStatus 
              candidateId={id} 
              currentStatus={typedCandidate.availability_status || 'not_yet_talked'} 
            />
          </div>
          <p className="text-sm sm:text-base text-muted-foreground">
            {typedCandidate.experience_years && `${typedCandidate.experience_years} years experience • `}
            {typedCandidate.location ?? 'Unknown location'}
          </p>
          <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-2 text-xs sm:text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Added {formatRelativeTime(typedCandidate.created_at)}
            </span>
            {typedCandidate.last_contacted && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                Last contacted {formatRelativeTime(typedCandidate.last_contacted)}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          {typedCandidate.linkedin_url && (
            <a href={typedCandidate.linkedin_url} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm">
                <Linkedin className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">LinkedIn</span>
              </Button>
            </a>
          )}
          <a href={`/api/file?pathname=${encodeURIComponent(typedCandidate.resume_blob_pathname)}`} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm">View Resume</Button>
          </a>
          <Link href={`/candidates/${id}/edit`}>
            <Button variant="outline" size="sm">Edit</Button>
          </Link>
          <CandidateActions candidate={typedCandidate} />
        </div>
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4 sm:space-y-6">
          {/* Verdict Sections */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Recruiter Verdict */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-4 w-4 text-green-600" />
                  Recruiter Assessment
                </CardTitle>
                <CardDescription className="text-xs">
                  Overall verdict from recruiting team
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CandidateVerdict
                  candidateId={id}
                  type="recruiter"
                  currentVerdict={typedCandidate.recruiter_verdict as 'very_strong' | 'strong' | 'moderate' | 'weak' | 'pass' | null}
                  canEdit={canSetRecruiterVerdict}
                />
              </CardContent>
            </Card>

            {/* Lily's Verdict - Only visible to super admin and admin */}
            {isAdmin && (
              <Card className="border-purple-200 bg-purple-50/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-purple-600" />
                    Lily&apos;s Assessment
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Super admin evaluation (visible to admins only)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <CandidateVerdict
                    candidateId={id}
                    type="lily"
                    currentVerdict={typedCandidate.lily_verdict as 'very_strong' | 'strong' | 'moderate' | 'weak' | 'pass' | null}
                    canEdit={isSuperAdmin}
                  />
                </CardContent>
              </Card>
            )}
          </div>

          {/* AI Analysis Section */}
          <Card className="border-blue-200 bg-blue-50/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Brain className="h-4 w-4 text-blue-600" />
                AI Candidate Analysis
              </CardTitle>
              <CardDescription className="text-xs">
                AI-powered assessment and insights
              </CardDescription>
            </CardHeader>
            <CardContent>
              {typedCandidate.ai_analysis ? (
                <div className="prose prose-sm max-w-none text-sm text-foreground whitespace-pre-wrap">
                  {typedCandidate.ai_analysis}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  No AI analysis available yet. Analysis will be added when external evaluation is complete.
                </p>
              )}
            </CardContent>
          </Card>

          {parsedData?.summary && (
            <Card>
              <CardHeader>
                <CardTitle>Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-foreground">{parsedData.summary}</p>
              </CardContent>
            </Card>
          )}

          {/* Pipeline Status - Jobs this candidate is in */}
          {pipelineData && pipelineData.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Briefcase className="h-5 w-5" />
                      Active Pipeline
                    </CardTitle>
                    <CardDescription>
                      Jobs this candidate is being considered for
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {pipelineData.map((pipeline: { id: string; stage: string; created_at: string; job: { id: string; title: string; company_name: string } | null }) => {
                    const stage = stageColors[pipeline.stage] || stageColors.sourced
                    const daysInStage = Math.floor((Date.now() - new Date(pipeline.created_at).getTime()) / (1000 * 60 * 60 * 24))
                    
                    return (
                      <Link key={pipeline.id} href={`/jobs/${pipeline.job?.id}`}>
                        <div className="flex items-center justify-between p-4 border rounded-lg hover:border-primary/50 transition-colors">
                          <div className="flex items-center gap-4">
                            <div className={`w-2 h-10 rounded-full ${stage.bg}`}></div>
                            <div>
                              <p className="font-medium text-foreground">{pipeline.job?.title || 'Unknown Job'}</p>
                              <p className="text-sm text-muted-foreground">{pipeline.job?.company_name || 'Unknown Company'}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <Badge className={`${stage.bg} ${stage.text} border-0`}>
                                {stageLabels[pipeline.stage] || pipeline.stage}
                              </Badge>
                              <p className="text-xs text-muted-foreground mt-1">
                                {daysInStage === 0 ? 'Today' : `${daysInStage}d in stage`}
                              </p>
                            </div>
                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-foreground">Top Job Matches</h2>
                <p className="text-sm text-muted-foreground">
                  {typedMatches.length} relevant job{typedMatches.length !== 1 ? 's' : ''}
                  {allMatches.length > typedMatches.length && ` (filtered from ${allMatches.length} total)`}
                  {candidateCategories.length > 0 && (
                    <span className="ml-1">
                      - detected expertise: {candidateCategories.map(c => c.category).join(', ')}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex gap-2">
                {typedMatches.length > 0 && (
                  <SendOpportunitiesButton 
                    candidate={typedCandidate} 
                    matches={typedMatches} 
                  />
                )}
                <Link href="/jobs/new">
                  <Button variant="outline" size="sm">Add Job</Button>
                </Link>
              </div>
            </div>
            {typedMatches.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <p className="text-muted-foreground mb-4">No job matches yet</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Create job listings to match this candidate against
                  </p>
                  <Link href="/jobs/new">
                    <Button>Create a Job</Button>
                  </Link>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {typedMatches.map((match) => (
                  <MatchDetailCard 
                    key={match.id} 
                    match={match}
                    showCandidate={false}
                    showJob={true}
                  />
                ))}
              </div>
            )}
          </div>

          {parsedData?.work_history && parsedData.work_history.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Work History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {parsedData.work_history.map((work, i) => (
                    <div key={i} className="border-l-2 border-border pl-4">
                      <p className="font-medium text-foreground">{work.title}</p>
                      <p className="text-sm text-muted-foreground">{work.company} - {work.duration}</p>
                      {work.description && (
                        <p className="mt-2 text-sm text-foreground">{work.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {parsedData?.education && parsedData.education.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Education</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {parsedData.education.map((edu, i) => (
                    <div key={i}>
                      <p className="font-medium text-foreground">{edu.degree} in {edu.field}</p>
                      <p className="text-sm text-muted-foreground">{edu.institution} - {edu.year}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {/* Owner Assignment */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Ownership
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Profile Owner</p>
                <CandidateOwnerAssignment 
                  candidateId={id} 
                  currentOwner={ownerInfo}
                  currentOwnerId={typedCandidate.owner_user_id}
                />
              </div>
              {createdByInfo && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Created By</p>
                  <p className="text-sm font-medium text-foreground">
                    {createdByInfo.full_name || createdByInfo.email}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recruiter Notes - Private */}
          <RecruiterNotes candidateId={id} />

          {/* Activity Log */}
          <CandidateActivityLog candidateId={id} />

          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {typedCandidate.email && (
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <a href={`mailto:${typedCandidate.email}`} className="font-medium text-primary hover:underline">
                    {typedCandidate.email}
                  </a>
                </div>
              )}
              {typedCandidate.phone && (
                <div>
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <a href={`tel:${typedCandidate.phone}`} className="font-medium text-primary hover:underline">
                    {typedCandidate.phone}
                  </a>
                </div>
              )}
              {typedCandidate.linkedin_url && (
                <div>
                  <p className="text-sm text-muted-foreground">LinkedIn</p>
                  <a href={typedCandidate.linkedin_url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline flex items-center gap-1">
                    <Linkedin className="h-4 w-4" />
                    View Profile
                  </a>
                </div>
              )}
              {typedCandidate.remote_preference && (
                <div>
                  <p className="text-sm text-muted-foreground">Remote Preference</p>
                  <p className="font-medium text-foreground capitalize">{typedCandidate.remote_preference}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {(typedCandidate.salary_expectation_min || typedCandidate.salary_expectation_max) && (
            <Card>
              <CardHeader>
                <CardTitle>Salary Expectations</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-foreground">
                  ${typedCandidate.salary_expectation_min?.toLocaleString() ?? '?'} - ${typedCandidate.salary_expectation_max?.toLocaleString() ?? '?'}
                </p>
              </CardContent>
            </Card>
          )}

          {typedCandidate.skills && typedCandidate.skills.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Skills</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {typedCandidate.skills.map((skill) => (
                    <span key={skill} className="rounded-md bg-primary/10 px-3 py-1 text-sm text-primary font-medium">
                      {skill}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {parsedData?.certifications && parsedData.certifications.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Certifications</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {parsedData.certifications.map((cert, i) => (
                    <li key={i} className="text-foreground">{cert}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Resume</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-2">{typedCandidate.resume_filename}</p>
              <a 
                href={`/api/file?pathname=${encodeURIComponent(typedCandidate.resume_blob_pathname)}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline"
              >
                Download PDF
              </a>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
