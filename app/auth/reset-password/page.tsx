'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
import { CheckCircle, Lock, Eye, EyeOff } from 'lucide-react'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)
  const [isValidSession, setIsValidSession] = useState<boolean | null>(null)

  useEffect(() => {
    // Check if we have a valid session from the reset link
    const checkSession = async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      setIsValidSession(!!session)
    }
    checkSession()
  }, [])

  const validatePassword = (pwd: string) => {
    if (pwd.length < 8) return 'Password must be at least 8 characters'
    if (!/[A-Z]/.test(pwd)) return 'Password must contain at least one uppercase letter'
    if (!/[a-z]/.test(pwd)) return 'Password must contain at least one lowercase letter'
    if (!/[0-9]/.test(pwd)) return 'Password must contain at least one number'
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    // Validate password
    const passwordError = validatePassword(password)
    if (passwordError) {
      setError(passwordError)
      setIsLoading(false)
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      setIsLoading(false)
      return
    }

    const supabase = createClient()

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      })

      if (error) throw error
      setIsSuccess(true)
      
      // Redirect to login after 3 seconds
      setTimeout(() => {
        router.push('/auth/login')
      }, 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  if (isValidSession === null) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center p-4 bg-muted/30">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!isValidSession) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center p-4 sm:p-6 md:p-10 bg-muted/30">
        <div className="w-full max-w-sm">
          <div className="flex flex-col gap-4 sm:gap-6">
            <div className="text-center mb-1 sm:mb-2">
              <Link href="/" className="font-semibold text-xl sm:text-2xl text-foreground">
                Refery<span className="text-primary">.</span>
              </Link>
            </div>
            <Card className="border-0 sm:border shadow-lg sm:shadow-md">
              <CardContent className="px-4 sm:px-6 py-8 text-center">
                <h2 className="text-xl font-semibold text-foreground mb-2">Invalid or expired link</h2>
                <p className="text-sm text-muted-foreground mb-6">
                  This password reset link is invalid or has expired. Please request a new one.
                </p>
                <Link href="/auth/forgot-password">
                  <Button className="w-full">Request new link</Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  if (isSuccess) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center p-4 sm:p-6 md:p-10 bg-muted/30">
        <div className="w-full max-w-sm">
          <div className="flex flex-col gap-4 sm:gap-6">
            <div className="text-center mb-1 sm:mb-2">
              <Link href="/" className="font-semibold text-xl sm:text-2xl text-foreground">
                Refery<span className="text-primary">.</span>
              </Link>
            </div>
            <Card className="border-0 sm:border shadow-lg sm:shadow-md">
              <CardContent className="px-4 sm:px-6 py-8 text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
                  <CheckCircle className="h-6 w-6 text-emerald-600" />
                </div>
                <h2 className="text-xl font-semibold text-foreground mb-2">Password updated</h2>
                <p className="text-sm text-muted-foreground mb-6">
                  Your password has been successfully updated. You will be redirected to login.
                </p>
                <Link href="/auth/login">
                  <Button className="w-full">Go to login</Button>
                </Link>
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
              Refery<span className="text-primary">.</span>
            </Link>
          </div>
          <Card className="border-0 sm:border shadow-lg sm:shadow-md">
            <CardHeader className="pb-4 sm:pb-6 px-4 sm:px-6">
              <CardTitle className="text-xl sm:text-2xl">Reset password</CardTitle>
              <CardDescription className="text-sm">
                Enter your new password below.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 sm:px-6 pb-6">
              <form onSubmit={handleSubmit}>
                <div className="flex flex-col gap-4">
                  <div className="grid gap-1.5">
                    <Label htmlFor="password" className="text-sm">New password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="h-11 sm:h-10 text-base sm:text-sm pr-10"
                        placeholder="Enter new password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      At least 8 characters with uppercase, lowercase, and number
                    </p>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="confirmPassword" className="text-sm">Confirm password</Label>
                    <Input
                      id="confirmPassword"
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="h-11 sm:h-10 text-base sm:text-sm"
                      placeholder="Confirm new password"
                    />
                  </div>
                  {error && (
                    <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                      <p className="text-sm text-destructive">{error}</p>
                    </div>
                  )}
                  <Button type="submit" className="w-full h-11 sm:h-10 gap-2" disabled={isLoading}>
                    {isLoading ? (
                      'Updating...'
                    ) : (
                      <>
                        <Lock className="h-4 w-4" />
                        Update password
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
