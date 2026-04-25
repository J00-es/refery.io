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
  
  // Run all queries in parallel
  const [companiesResult, jobsResult] = await Promise.all([
    dbClient.from('companies').select('*').order('name', { ascending: true }),
    dbClient.from('jobs').select('company_name, status')
  ])

  const companies = companiesResult.data as (Company & { relationship_status?: string })[] | null
  const jobs = jobsResult.data

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

  // Add/update with job data
  jobs?.forEach(job => {
    if (job.company_name) {
      const key = job.company_name.toLowerCase()
      const existing = companyMap.get(key)
      const isActive = job.status === 'open' || job.status === 'active'
      if (existing) {
        if (isActive) existing.jobCount++
      } else {
        companyMap.set(key, {
          name: job.company_name,
          jobCount: isActive ? 1 : 0,
          isFromDatabase: false,
        })
      }
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
