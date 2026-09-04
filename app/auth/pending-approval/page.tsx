'use client'

export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { CheckCircle, LogOut, Clock, ArrowRight } from 'lucide-react'

export default function PendingApprovalPage() {
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [userName, setUserName] = useState<string | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUserEmail(user.email || null)
        
        // Use API to check status (bypasses RLS)
        try {
          const res = await fetch('/api/auth/check-status')
          const data = await res.json()
          
          if (data.fullName) {
            setUserName(data.fullName)
          }
          
          // If already active or super admin, redirect to dashboard
          if (data.status === 'active' || data.isSuperAdmin) {
            router.push('/dashboard')
          }
        } catch (e) {
          console.error('Failed to check status:', e)
        }
      }
    }
    getUser()
  }, [supabase, router])

  const handleCheckStatus = async () => {
    setIsChecking(true)
    try {
      const res = await fetch('/api/auth/check-status')
      const data = await res.json()
      
      if (data.status === 'active' || data.isSuperAdmin) {
        router.push('/dashboard')
      } else {
        setIsChecking(false)
      }
    } catch (e) {
      console.error('Failed to check status:', e)
      setIsChecking(false)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  const firstName = userName?.split(' ')[0]

  return (
    <div className="min-h-svh w-full bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-10 bg-background border-b">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-semibold text-xl text-foreground">
            Refery<span className="text-primary">.</span>io
          </Link>
          <Button variant="ghost" size="sm" onClick={handleSignOut} className="gap-2 text-muted-foreground">
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-24 pb-16 px-6">
        <div className="max-w-md mx-auto text-center">
          {/* Status indicator */}
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-6">
            <Clock className="h-8 w-8 text-primary" />
          </div>

          {/* Welcome Message */}
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-3">
            {firstName ? `Hey ${firstName}, we're on it!` : "We're on it!"}
          </h1>
          
          <p className="text-muted-foreground mb-8">
            Your application is being reviewed by our team. We will notify you at{' '}
            <span className="font-medium text-foreground">{userEmail || 'your email'}</span>{' '}
            within 24 hours.
          </p>

          {/* Check Status Button */}
          <Button 
            onClick={handleCheckStatus} 
            disabled={isChecking}
            className="gap-2 mb-12"
            size="lg"
          >
            {isChecking ? (
              'Checking...'
            ) : (
              <>
                <CheckCircle className="h-4 w-4" />
                Check My Status
              </>
            )}
          </Button>

          {/* Divider */}
          <div className="border-t mb-8" />

          {/* What to expect */}
          <h3 className="text-sm font-medium text-muted-foreground mb-6 text-left">
            Once approved, you will be able to
          </h3>
          <div className="space-y-3 text-left">
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-foreground">Browse exclusive job opportunities from top startups</span>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-foreground">Submit candidates from your network</span>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-foreground">Earn referral bonuses for successful placements</span>
            </div>
          </div>

          {/* Footer */}
          <p className="mt-12 text-sm text-muted-foreground">
            Questions? Contact us at{' '}
            <a href="mailto:support@refery.io" className="text-primary hover:underline">
              support@refery.io
            </a>
          </p>
        </div>
      </main>
    </div>
  )
}
