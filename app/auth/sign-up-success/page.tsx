'use client'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import Link from 'next/link'
import { Clock, HelpCircle, Sparkles, Users, Briefcase } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function Page() {
  return (
    <div className="min-h-svh w-full bg-gradient-to-b from-background to-muted/30">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-10 bg-background/80 backdrop-blur-sm border-b">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-serif text-xl text-foreground">
            Refery<span className="text-primary">.</span>io
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-24 pb-16 px-6">
        <div className="max-w-2xl mx-auto text-center">
          {/* Animated dots */}
          <div className="flex justify-center gap-1.5 mb-8">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" style={{ animationDelay: '0ms' }} />
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" style={{ animationDelay: '200ms' }} />
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" style={{ animationDelay: '400ms' }} />
          </div>

          {/* Welcome Message */}
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-4">
            Thank you for signing up!
          </h1>
          
          <p className="text-lg text-muted-foreground max-w-md mx-auto mb-12">
            Our team is reviewing your application. We&apos;ll get back to you within 48 hours.
          </p>

          {/* Status Card */}
          <Card className="mb-12 text-left">
            <CardHeader className="pb-4">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <Clock className="h-6 w-6 text-amber-600" />
                </div>
                <div>
                  <CardTitle className="text-lg">Application Under Review</CardTitle>
                  <CardDescription className="mt-1">
                    We review every application to ensure quality for our network. This process usually takes 24-48 hours.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
                <p>
                  We&apos;ll send you an email notification once your account is approved. 
                  Please check your inbox (and spam folder) for updates from us.
                </p>
              </div>
              
              <div className="mt-4">
                <Link href="/auth/login">
                  <Button variant="outline" className="w-full">
                    Back to Login
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* What to expect */}
          <div className="text-left">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
              What you can expect once approved
            </h3>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-card border">
                <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center mb-3">
                  <Briefcase className="h-5 w-5 text-blue-600" />
                </div>
                <h4 className="font-medium text-foreground mb-1">Access Jobs</h4>
                <p className="text-sm text-muted-foreground">Browse exclusive job opportunities from top startups</p>
              </div>
              <div className="p-4 rounded-xl bg-card border">
                <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center mb-3">
                  <Users className="h-5 w-5 text-emerald-600" />
                </div>
                <h4 className="font-medium text-foreground mb-1">Submit Candidates</h4>
                <p className="text-sm text-muted-foreground">Refer talented people from your network</p>
              </div>
              <div className="p-4 rounded-xl bg-card border">
                <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center mb-3">
                  <Sparkles className="h-5 w-5 text-purple-600" />
                </div>
                <h4 className="font-medium text-foreground mb-1">Earn Rewards</h4>
                <p className="text-sm text-muted-foreground">Get paid for successful placements</p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-12 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <HelpCircle className="h-4 w-4" />
            <span>Questions?</span>
            <a 
              href="mailto:hello@refery.io" 
              className="text-primary font-medium hover:underline"
            >
              Contact support
            </a>
          </div>
        </div>
      </main>
    </div>
  )
}
