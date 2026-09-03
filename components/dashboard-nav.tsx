'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { cn } from '@/lib/utils'
import { Settings, Menu, X, Home, Briefcase, Users, Building2, LogOut, ChevronRight, UserCircle, UserPlus, Star, ChevronDown, Send, Mail, Handshake, type LucideIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useState, useEffect } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  /**
   * Kept in step with JOBS_SUPER_ADMIN_ONLY and COMPANIES_SUPER_ADMIN_ONLY,
   * which are what those routes actually enforce.
   */
  superAdminOnly?: boolean
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: Home },
  { href: '/jobs', label: 'Jobs', icon: Briefcase, superAdminOnly: true },
  { href: '/candidates', label: 'Candidates', icon: Users },
  { href: '/companies', label: 'Companies', icon: Building2, superAdminOnly: true },
]

/**
 * Surfaces still being built, super-admin-only for now.
 *
 * Two groups because they belong in different places, not because they differ in
 * permission. Partners leads the row: it is the handful of searches we are
 * actually retained on, where Jobs is the 29k-role sourced watchlist, and putting
 * it after would send everyone to the noise first. Briefs is a review queue you
 * visit when there is something in it, so it trails — grouping both up front
 * pushed Dashboard into third place, which is not what anyone opens first.
 *
 * Hiding a link is not access control. These are kept in step with
 * DESK_SUPER_ADMIN_ONLY and BRIEFS_SUPER_ADMIN_ONLY, which is what the pages and
 * their API handlers actually enforce.
 */
const superAdminLeadNavItems = [{ href: '/partners', label: 'Partners', icon: Handshake }]
const superAdminTrailNavItems = [{ href: '/briefs', label: 'Briefs', icon: Mail }]

/**
 * Admin destinations live in the Admin menu rather than the top row.
 *
 * Outreach, Recruiters and Talents used to sit inline, which gave a super admin
 * ten top-level links plus a name, an email and a Sign Out button. That does not
 * fit: measured on the live site, the header ran to 1,377px inside a 1,051px
 * viewport, so every page in the app scrolled sideways on any laptop narrower
 * than about 1,400px.
 *
 * They are prospecting and admin tools rather than daily surfaces, so the menu is
 * where they belong anyway — the row is now the five things everyone uses, plus
 * Partners for the super admin.
 */
const adminMenuItems = [
  { href: '/outreach', label: 'Outreach', icon: Send },
  { href: '/recruiters', label: 'Recruiters', icon: UserPlus },
  { href: '/talents', label: 'Talents', icon: Star },
  { href: '/admin', label: 'Users', icon: Users },
]

interface DashboardNavProps {
  user: User
  isAdmin?: boolean
  userRole?: string
  fullName?: string | null
}

const roleLabels: Record<string, { label: string; color: string }> = {
  super_admin: { label: 'Super Admin', color: 'bg-red-100 text-red-700' },
  admin: { label: 'Admin', color: 'bg-purple-100 text-purple-700' },
  recruiter: { label: 'Recruiter', color: 'bg-blue-100 text-blue-700' },
  scout: { label: 'Scout', color: 'bg-green-100 text-green-700' },
  hiring_manager: { label: 'Hiring Manager', color: 'bg-amber-100 text-amber-700' },
  viewer: { label: 'Viewer', color: 'bg-gray-100 text-gray-700' },
}

export function DashboardNav({ user, isAdmin = false, userRole = 'viewer', fullName }: DashboardNavProps) {
  const pathname = usePathname()
  const router = useRouter()
  const isSuperAdmin = userRole === 'super_admin'
  // Hiding a link is not access control: /jobs and /companies are enforced by
  // their route layouts and by every handler under /api/jobs and
  // /api/companies. This only keeps the row honest.
  const visibleNavItems = navItems.filter(item => !item.superAdminOnly || isSuperAdmin)
  const supabase = createClient()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  const isActiveRoute = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-card">
      <div className="container mx-auto flex h-14 sm:h-16 items-center justify-between px-4">
        {/* Logo and Desktop Nav */}
        <div className="flex items-center gap-4 lg:gap-8">
          <Link href="/dashboard" className="font-serif text-lg sm:text-xl text-foreground">
            Refery<span className="text-green-500">.</span>io
          </Link>
          
          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {isSuperAdmin && superAdminLeadNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'px-3 lg:px-4 py-2 rounded-md text-sm font-medium transition-colors',
                  isActiveRoute(item.href)
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                )}
              >
                {item.label}
              </Link>
            ))}
            {visibleNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'px-3 lg:px-4 py-2 rounded-md text-sm font-medium transition-colors',
                  isActiveRoute(item.href)
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                )}
              >
                {item.label}
              </Link>
            ))}
            {isSuperAdmin && superAdminTrailNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'px-3 lg:px-4 py-2 rounded-md text-sm font-medium transition-colors',
                  isActiveRoute(item.href)
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                )}
              >
                {item.label}
              </Link>
            ))}
            {isAdmin && (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className={cn(
                        'px-3 lg:px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1',
                        pathname.startsWith('/admin')
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                      )}
                    >
                      <Settings className="h-4 w-4" />
                      Admin
                      <ChevronDown className="h-3 w-3 ml-1" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {adminMenuItems.map((item) => {
                      const Icon = item.icon
                      return (
                        <DropdownMenuItem key={item.href} asChild>
                          <Link href={item.href} className="flex items-center gap-2">
                            <Icon className="h-4 w-4" />
                            {item.label}
                          </Link>
                        </DropdownMenuItem>
                      )
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </nav>
        </div>

        {/* Desktop User Info */}
        <div className="hidden md:flex items-center gap-3 lg:gap-4">
          <Link 
            href="/profile"
            className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-accent/50 transition-colors"
          >
            <p className="max-w-[160px] truncate text-sm font-medium text-foreground">
              {fullName || user.email}
            </p>
            {roleLabels[userRole] && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-md whitespace-nowrap ${roleLabels[userRole].color}`}>
                {roleLabels[userRole].label}
              </span>
            )}
          </Link>
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            Sign Out
          </Button>
        </div>

        {/* Mobile Menu Button */}
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Open menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[300px] sm:w-[350px] p-0">
            <SheetHeader className="p-4 border-b">
              <SheetTitle className="text-left font-serif text-lg">
                Refery<span className="text-green-500">.</span>io
              </SheetTitle>
            </SheetHeader>
            
            {/* User Info in Mobile */}
            <Link href="/profile" className="block p-4 border-b bg-muted/30 hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-medium">
                  {(fullName || user.email || 'U')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {fullName || 'User'}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
                {roleLabels[userRole] && (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${roleLabels[userRole].color}`}>
                    {roleLabels[userRole].label}
                  </span>
                )}
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            </Link>

            {/* Mobile Navigation */}
            <nav className="p-2">
              {isSuperAdmin && superAdminLeadNavItems.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors',
                      isActiveRoute(item.href)
                        ? 'bg-accent text-accent-foreground'
                        : 'text-foreground hover:bg-accent/50'
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {item.label}
                    <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />
                  </Link>
                )
              })}
              {visibleNavItems.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors',
                      isActiveRoute(item.href)
                        ? 'bg-accent text-accent-foreground'
                        : 'text-foreground hover:bg-accent/50'
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {item.label}
                    <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />
                  </Link>
                )
              })}
              {isSuperAdmin && superAdminTrailNavItems.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors',
                      isActiveRoute(item.href)
                        ? 'bg-accent text-accent-foreground'
                        : 'text-foreground hover:bg-accent/50'
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {item.label}
                    <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />
                  </Link>
                )
              })}
              {isAdmin && (
                <>
                  {adminMenuItems.map((item) => {
                    const Icon = item.icon
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          'flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors',
                          pathname.startsWith(item.href)
                            ? 'bg-accent text-accent-foreground'
                            : 'text-foreground hover:bg-accent/50'
                        )}
                      >
                        <Icon className="h-5 w-5" />
                        {item.label}
                        <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />
                      </Link>
                    )
                  })}
                </>
              )}
            </nav>

            {/* Sign Out Button */}
            <div className="absolute bottom-0 left-0 right-0 p-4 border-t bg-card">
              <Button 
                variant="outline" 
                className="w-full justify-center gap-2" 
                onClick={handleSignOut}
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  )
}
