'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BarChart3, Users, Settings, Filter } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [adminRole, setAdminRole] = useState<string | null>(null)

  useEffect(() => {
    async function checkAccess() {
      try {
        const res = await fetch('/api/admin/check-access')
        if (!res.ok) {
          router.push('/dashboard')
          return
        }
        const data = await res.json()
        setAdminRole(data.role)
      } catch {
        router.push('/dashboard')
      } finally {
        setLoading(false)
      }
    }
    checkAccess()
  }, [router])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (!adminRole) {
    return null
  }

  const isSuperAdmin = adminRole === 'super_admin'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Admin Dashboard</h1>
          <p className="text-muted-foreground">
            Manage users, view analytics, and configure settings
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
          {adminRole === 'super_admin' ? 'Super Admin' : 'Admin'}
        </div>
      </div>

      <nav className="flex gap-4 border-b pb-4">
        <Link
          href="/admin"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <BarChart3 className="h-4 w-4" />
          Analytics
        </Link>
        <Link
          href="/admin/funnel"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <Filter className="h-4 w-4" />
          Funnel
        </Link>
        {isSuperAdmin && (
          <Link
            href="/admin/users"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Users className="h-4 w-4" />
            User Management
          </Link>
        )}
        <Link
          href="/admin/settings"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
      </nav>

      {children}
    </div>
  )
}
