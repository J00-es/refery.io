'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import { ArrowLeft, Mail, CheckCircle } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isEmailSent, setIsEmailSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    const supabase = createClient()

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      })

      if (error) throw error
      setIsEmailSent(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  if (isEmailSent) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center p-4 sm:p-6 md:p-10 bg-muted/30">
        <div className="w-full max-w-sm">
          <div className="flex flex-col gap-4 sm:gap-6">
            <div className="text-center mb-1 sm:mb-2">
              <Link href="/" className="font-semibold text-xl sm:text-2xl text-foreground">
                Refery<span className="text-primary">.</span>io
              </Link>
            </div>
            <Card className="border-0 sm:border shadow-lg sm:shadow-md">
              <CardContent className="px-4 sm:px-6 py-8 text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <CheckCircle className="h-6 w-6 text-primary" />
                </div>
                <h2 className="text-xl font-semibold text-foreground mb-2">Check your email</h2>
                <p className="text-sm text-muted-foreground mb-6">
                  We sent a password reset link to<br />
                  <span className="font-medium text-foreground">{email}</span>
                </p>
                <p className="text-xs text-muted-foreground mb-6">
                  Did not receive the email? Check your spam folder or try a different email address.
                </p>
                <div className="space-y-2">
                  <Button
                    onClick={() => {
                      setIsEmailSent(false)
                      setEmail('')
                    }}
                    variant="outline"
                    className="w-full"
                  >
                    Try another email
                  </Button>
                  <Link href="/auth/login">
                    <Button variant="ghost" className="w-full gap-2">
                      <ArrowLeft className="h-4 w-4" />
                      Back to login
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-4 sm:p-6 md:p-10 bg-muted/30">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-4 sm:gap-6">
          <div className="text-center mb-1 sm:mb-2">
            <Link href="/" className="font-semibold text-xl sm:text-2xl text-foreground">
              Refery<span className="text-primary">.</span>io
            </Link>
          </div>
          <Card className="border-0 sm:border shadow-lg sm:shadow-md">
            <CardHeader className="pb-4 sm:pb-6 px-4 sm:px-6">
              <CardTitle className="text-xl sm:text-2xl">Forgot password?</CardTitle>
              <CardDescription className="text-sm">
                Enter your email address and we will send you a link to reset your password.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 sm:px-6 pb-6">
              <form onSubmit={handleSubmit}>
                <div className="flex flex-col gap-4">
                  <div className="grid gap-1.5">
                    <Label htmlFor="email" className="text-sm">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-11 sm:h-10 text-base sm:text-sm"
                      autoCapitalize="none"
                      autoCorrect="off"
                    />
                  </div>
                  {error && (
                    <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                      <p className="text-sm text-destructive">{error}</p>
                    </div>
                  )}
                  <Button type="submit" className="w-full h-11 sm:h-10 gap-2" disabled={isLoading}>
                    {isLoading ? (
                      'Sending...'
                    ) : (
                      <>
                        <Mail className="h-4 w-4" />
                        Send reset link
                      </>
                    )}
                  </Button>
                </div>
                <div className="mt-4 text-center">
                  <Link
                    href="/auth/login"
                    className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back to login
                  </Link>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
