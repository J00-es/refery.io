import { createClient, createAdminClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import type { Company } from '@/lib/types'
import { Plus } from 'lucide-react'
import { BatchUpload } from '@/components/batch-upload'
import { CompanyList } from '@/components/company-list'

// Hardcoded super admins
const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']

interface CompanyFromJobs {
  name: string
  jobCount: number
  isFromDatabase: boolean
  companyData?: Company & { relationship_status?: string }
}

export default async function CompaniesPage() {
  const supabase = await createClient()
  const adminClient = createAdminClient()
  
  // Get current user first
  const { data: { user } } = await supabase.auth.getUser()
  
  // Check if super admin - use admin client to bypass RLS
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(user?.email || '')
  const dbClient = isSuperAdmin ? adminClient : supabase
  
  // Pull only the columns the list view actually uses (skips heavy fields like
  // hiring_dna, eng_team_dna, gtm_team_dna, hiring_insights, etc.). The active
  // job counts come from a SQL view that aggregates jobs in the database
  // instead of shipping every job row to the server just to count them.
  const COMPANY_LIST_COLUMNS = 'id, name, description, logo_url, employee_count, industry, linkedin_url, location, relationship_status, stage, created_at'
  const [companiesResult, jobCountsResult] = await Promise.all([
    dbClient.from('companies').select(COMPANY_LIST_COLUMNS).order('name', { ascending: true }),
    dbClient.from('company_active_job_counts').select('company_name_lower, company_name, job_count'),
  ])

  const companies = companiesResult.data as (Company & { relationship_status?: string })[] | null
  type JobCountRow = { company_name_lower: string; company_name: string; job_count: number }
  const jobCounts = (jobCountsResult.data ?? []) as JobCountRow[]

  // Check admin status
  let isAdmin = isSuperAdmin
  if (!isAdmin && user?.email) {
    const { data: adminData } = await adminClient
      .from('users_admin')
      .select('role')
      .eq('email', user.email)
      .single()
    isAdmin = adminData && ['super_admin', 'admin'].includes(adminData.role)
  }

  // Build company map efficiently
  const companyMap = new Map<string, CompanyFromJobs>()

  // Add database companies
  companies?.forEach(company => {
    companyMap.set(company.name.toLowerCase(), {
      name: company.name,
      jobCount: 0,
      isFromDatabase: true,
      companyData: company,
    })
  })

  // Merge in aggregated active job counts (one row per distinct lower(company_name))
  jobCounts.forEach(row => {
    const key = row.company_name_lower
    const count = Number(row.job_count) || 0
    const existing = companyMap.get(key)
    if (existing) {
      existing.jobCount = count
    } else {
      companyMap.set(key, {
        name: row.company_name,
        jobCount: count,
        isFromDatabase: false,
      })
    }
  })

  // Filter out "in_pipeline" companies for non-admins
  const allCompanies = Array.from(companyMap.values())
    .filter(company => {
      // If not admin and company is in pipeline status, hide it
      if (!isAdmin && company.companyData?.relationship_status === 'in_pipeline') {
        return false
      }
      return true
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="space-y-6 sm:space-y-8 px-4 sm:px-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Companies</h1>
          <p className="text-muted-foreground text-sm sm:text-base">{allCompanies.length} companies</p>
        </div>
        <div className="flex gap-2">
          <BatchUpload type="companies" />
          <Link href="/companies/new">
            <Button size="sm" className="sm:size-default"><Plus className="h-4 w-4 mr-2" />Add Company</Button>
          </Link>
        </div>
      </div>

      <CompanyList companies={allCompanies} isAdmin={isAdmin} />
    </div>
  )
}
