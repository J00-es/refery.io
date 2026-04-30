'use client'

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
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { User, Search, Building } from 'lucide-react'

export default function Page() {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [linkedinUrl, setLinkedinUrl] = useState('')
  const [password, setPassword] = useState('')
  const [repeatPassword, setRepeatPassword] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [selectedRole, setSelectedRole] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    if (!acceptedTerms) {
      setError('You must accept the Terms & Conditions to continue')
      setIsLoading(false)
      return
    }

    if (password !== repeatPassword) {
      setError('Passwords do not match')
      setIsLoading(false)
      return
    }

    if (!fullName.trim()) {
      setError('Please enter your full name')
      setIsLoading(false)
      return
    }

    if (!linkedinUrl.trim()) {
      setError('LinkedIn profile URL is required')
      setIsLoading(false)
      return
    }

    if (!linkedinUrl.includes('linkedin.com')) {
      setError('Please enter a valid LinkedIn URL')
      setIsLoading(false)
      return
    }

    if (!selectedRole) {
      setError('Please select your role')
      setIsLoading(false)
      return
    }

    try {
      // Use API route to sign up (ensures admin client is used for users_admin insert)
      const res = await fetch('/api/auth/sign-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          fullName,
          linkedinUrl,
          role: selectedRole,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Sign up failed')
      }

      // Save email to localStorage for resend functionality
      localStorage.setItem('pendingVerificationEmail', email)
      
      router.push('/auth/sign-up-success')
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-4 sm:p-6 md:p-10 bg-muted/30">
      <div className="w-full max-w-md">
        <div className="flex flex-col gap-4 sm:gap-6">
          <div className="text-center mb-1 sm:mb-2">
            <Link href="/" className="font-serif text-xl sm:text-2xl text-foreground">
              Refery<span className="text-green-500">.</span>io
            </Link>
          </div>
          <Card className="border-0 sm:border shadow-lg sm:shadow-md">
            <CardHeader className="pb-4 sm:pb-6 px-4 sm:px-6">
              <CardTitle className="text-xl sm:text-2xl">Join Refery</CardTitle>
              <CardDescription className="text-sm">Create your account to get started</CardDescription>
            </CardHeader>
            <CardContent className="px-4 sm:px-6 pb-6">
              <form onSubmit={handleSignUp}>
                <div className="flex flex-col gap-3 sm:gap-4">
                  <div className="grid gap-1.5">
                    <Label htmlFor="fullName" className="text-sm">Full Name *</Label>
                    <Input
                      id="fullName"
                      type="text"
                      placeholder="John Smith"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="h-11 sm:h-10 text-base sm:text-sm"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="email" className="text-sm">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="john@example.com"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-11 sm:h-10 text-base sm:text-sm"
                      autoCapitalize="none"
                      autoCorrect="off"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="linkedinUrl" className="text-sm">LinkedIn Profile URL *</Label>
                    <Input
                      id="linkedinUrl"
                      type="url"
                      placeholder="linkedin.com/in/yourprofile"
                      required
                      value={linkedinUrl}
                      onChange={(e) => setLinkedinUrl(e.target.value)}
                      className="h-11 sm:h-10 text-base sm:text-sm"
                      autoCapitalize="none"
                      autoCorrect="off"
                    />
                    <p className="text-xs text-muted-foreground">Required to verify your professional identity</p>
                  </div>

                  <div className="grid gap-3 mt-2">
                    <Label>What best describes you? *</Label>
                    <RadioGroup value={selectedRole} onValueChange={setSelectedRole} className="grid gap-2">
                      <div className={`flex items-start space-x-3 rounded-lg border p-3 sm:p-4 cursor-pointer transition-colors ${selectedRole === 'scout' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
                        <RadioGroupItem value="scout" id="scout" className="mt-1" />
                        <Label htmlFor="scout" className="flex items-start gap-3 cursor-pointer flex-1">
                          <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700">
                            <Search className="h-4 w-4 sm:h-5 sm:w-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm sm:text-base">Scout</p>
                            <p className="text-xs sm:text-sm text-muted-foreground leading-snug">Not a professional recruiter, but you have a great network and want to share talented people with Refery</p>
                          </div>
                        </Label>
                      </div>
                      <div className={`flex items-start space-x-3 rounded-lg border p-3 sm:p-4 cursor-pointer transition-colors ${selectedRole === 'recruiter' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
                        <RadioGroupItem value="recruiter" id="recruiter" className="mt-1" />
                        <Label htmlFor="recruiter" className="flex items-start gap-3 cursor-pointer flex-1">
                          <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700">
                            <User className="h-4 w-4 sm:h-5 sm:w-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm sm:text-base">Partner Recruiter</p>
                            <p className="text-xs sm:text-sm text-muted-foreground leading-snug">A professional recruiter or independent talent partner looking to collaborate on placements</p>
                          </div>
                        </Label>
                      </div>
                      <div className={`flex items-start space-x-3 rounded-lg border p-3 sm:p-4 cursor-pointer transition-colors ${selectedRole === 'hiring_manager' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
                        <RadioGroupItem value="hiring_manager" id="hiring_manager" className="mt-1" />
                        <Label htmlFor="hiring_manager" className="flex items-start gap-3 cursor-pointer flex-1">
                          <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-700">
                            <Building className="h-4 w-4 sm:h-5 sm:w-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm sm:text-base">Hiring Manager</p>
                            <p className="text-xs sm:text-sm text-muted-foreground leading-snug">Looking to hire talent for your company through our network of recruiters and scouts</p>
                          </div>
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <div className="grid gap-1.5 mt-2">
                    <Label htmlFor="password" className="text-sm">Password *</Label>
                    <Input
                      id="password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-11 sm:h-10 text-base sm:text-sm"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="repeat-password" className="text-sm">Confirm Password *</Label>
                    <Input
                      id="repeat-password"
                      type="password"
                      required
                      value={repeatPassword}
                      onChange={(e) => setRepeatPassword(e.target.value)}
                      className="h-11 sm:h-10 text-base sm:text-sm"
                    />
                  </div>
                  
                  <div className="space-y-3 mt-2">
                    <div className="flex items-start gap-2">
                      <Checkbox 
                        id="terms" 
                        checked={acceptedTerms}
                        onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
                      />
                      <label htmlFor="terms" className="text-sm text-muted-foreground leading-tight cursor-pointer">
                        I agree to the{' '}
                        <Link href="/terms" className="text-primary hover:underline" target="_blank">
                          Terms & Conditions
                        </Link>{' '}
                        and{' '}
                        <Link href="/privacy" className="text-primary hover:underline" target="_blank">
                          Privacy Policy
                        </Link>
                        <span className="text-red-500 ml-0.5">*</span>
                      </label>
                    </div>
                  </div>
                  
                  {error && (
                    <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                      <p className="text-sm text-red-600">{error}</p>
                    </div>
                  )}
                  
                  <Button type="submit" className="w-full h-11 sm:h-10 mt-2 text-base sm:text-sm" disabled={isLoading}>
                    {isLoading ? 'Creating account...' : 'Create Account'}
                  </Button>
                </div>
                <div className="mt-4 text-center text-sm text-muted-foreground">
                  Already have an account?{' '}
                  <Link
                    href="/auth/login"
                    className="text-primary font-medium hover:underline underline-offset-4"
                  >
                    Sign in
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
