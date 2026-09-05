'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Spinner } from '@/components/ui/spinner'
import { UserAdmin } from '@/lib/types'
import { Plus, Trash2, Shield, ShieldCheck, User, Eye, Building, Search, ChevronRight, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

const roleIcons = {
  super_admin: ShieldCheck,
  admin: Shield,
  recruiter: User,
  scout: Search,
  hiring_manager: Building,
  viewer: Eye,
}

const roleColors = {
  super_admin: 'bg-purple-100 text-purple-700',
  admin: 'bg-blue-100 text-blue-700',
  recruiter: 'bg-green-100 text-green-700',
  scout: 'bg-teal-100 text-teal-700',
  hiring_manager: 'bg-orange-100 text-orange-700',
  viewer: 'bg-gray-100 text-gray-700',
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserAdmin[]>([])
  const [currentUserRole, setCurrentUserRole] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isAddingUser, setIsAddingUser] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')

  // New user form
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState('recruiter')

  useEffect(() => {
    fetchUsers()
  }, [])

  async function fetchUsers() {
    try {
      const res = await fetch('/api/admin/users')
      if (!res.ok) throw new Error('Failed to fetch users')
      const data = await res.json()
      setUsers(data.users)
      setCurrentUserRole(data.currentUserRole)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault()
    setIsAddingUser(true)
    setError('')

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, role: newRole }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to add user')
      }

      await fetchUsers()
      setNewEmail('')
      setNewRole('recruiter')
      setDialogOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsAddingUser(false)
    }
  }

  async function handleUpdateRole(userId: string, newRole: string) {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      })

      if (!res.ok) throw new Error('Failed to update role')
      await fetchUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  async function handleUpdateStatus(userId: string, newStatus: string) {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })

      if (!res.ok) throw new Error('Failed to update status')
      await fetchUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  /**
   * Beta is a third switch next to role and status, not a role of its own: a
   * scout in the beta is still a scout, they just see Searches and Pipeline
   * before everyone else does.
   */
  async function handleUpdateBeta(userId: string, isBeta: boolean) {
    setUsers(prev => prev.map(u => (u.id === userId ? { ...u, is_beta: isBeta } : u)))
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_beta: isBeta }),
      })

      if (!res.ok) throw new Error('Failed to update beta access')
      await fetchUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      await fetchUsers()
    }
  }

  async function handleDeleteUser(userId: string) {
    if (!confirm('Are you sure you want to remove this user?')) return

    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete user')
      }
      await fetchUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  async function handleSyncUsers() {
    setIsSyncing(true)
    setSyncMessage('')
    setError('')

    try {
      const res = await fetch('/api/admin/sync-users', {
        method: 'POST',
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to sync users')
      }

      setSyncMessage(data.message)
      await fetchUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsSyncing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  const isSuperAdmin = currentUserRole === 'super_admin'

  return (
    <div className="space-y-4 sm:space-y-6 px-4 sm:px-0">
      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 sm:p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {syncMessage && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-3 sm:p-4 text-sm text-green-700">
          {syncMessage}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-6">
          <div>
            <CardTitle className="text-lg sm:text-xl">User Management</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Manage team members and their access levels
            </CardDescription>
          </div>
          {isSuperAdmin && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleSyncUsers}
                disabled={isSyncing}
                size="sm"
                className="sm:size-default"
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Sync Auth Users</span>
                <span className="sm:hidden">Sync</span>
              </Button>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="sm:size-default">
                    <Plus className="mr-2 h-4 w-4" />
                    <span className="hidden sm:inline">Add User</span>
                    <span className="sm:hidden">Add</span>
                  </Button>
                </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New User</DialogTitle>
                  <DialogDescription>
                    Add a new team member with a specific role
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAddUser} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="user@company.com"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">Role</Label>
                    <Select value={newRole} onValueChange={setNewRole}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
<SelectContent>
                            <SelectItem value="super_admin">Super Admin</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="recruiter">Recruiter</SelectItem>
                            <SelectItem value="scout">Scout</SelectItem>
                            <SelectItem value="hiring_manager">Hiring Manager</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
                          </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Super Admin: Full access | Admin: Analytics | Recruiter: Jobs + candidates | Scout: Candidates only | Hiring Manager: Jobs only | Viewer: Read only
                    </p>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isAddingUser}>
                      {isAddingUser && <Spinner className="mr-2 h-4 w-4" />}
                      Add User
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
            </div>
          )}
        </CardHeader>
        <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
          <div className="space-y-2 sm:space-y-3">
            {users.map((user) => {
              const RoleIcon = roleIcons[user.role as keyof typeof roleIcons] || User
              const roleColor = roleColors[user.role as keyof typeof roleColors] || 'bg-gray-100 text-gray-700'

              return (
                <div
                  key={user.id}
                  className="rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  {/* Mobile Layout */}
                  <div className="sm:hidden">
                    <Link href={`/admin/users/${user.id}`} className="flex items-center gap-3 p-3">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${roleColor}`}>
                        <RoleIcon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{user.full_name || user.email}</div>
                        <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                        <div className="flex gap-1.5 mt-1.5">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${roleColor}`}>
                            {user.role.replace('_', ' ')}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
                            user.status === 'active' ? 'bg-green-100 text-green-700' :
                            user.status === 'inactive' ? 'bg-red-100 text-red-700' :
                            'bg-yellow-100 text-yellow-700'
                          }`}>
                            {user.status}
                          </span>
                          {user.is_beta && (
                            <span className="rounded-full bg-[#E7EDE9] px-2 py-0.5 text-[10px] font-medium text-[#1F3A2F]">
                              beta
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </Link>
                    {isSuperAdmin && (
                      <div className="flex items-center gap-2 px-3 pb-3 pt-1 border-t">
                        <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                          <Switch
                            checked={user.is_beta}
                            onCheckedChange={checked => handleUpdateBeta(user.id, checked)}
                            aria-label={`Beta access for ${user.full_name || user.email}`}
                          />
                          Beta
                        </label>
                        <Select
                          value={user.role}
                          onValueChange={(value) => handleUpdateRole(user.id, value)}
                        >
                          <SelectTrigger className="h-8 text-xs flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="super_admin">Super Admin</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="recruiter">Recruiter</SelectItem>
                            <SelectItem value="scout">Scout</SelectItem>
                            <SelectItem value="hiring_manager">Hiring Manager</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select
                          value={user.status}
                          onValueChange={(value) => handleUpdateStatus(user.id, value)}
                        >
                          <SelectTrigger className="h-8 text-xs w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="inactive">Inactive</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteUser(user.id)}
                          className="h-8 w-8 text-destructive hover:bg-destructive/10 shrink-0"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Desktop Layout */}
                  <div className="hidden sm:flex items-center justify-between p-4">
                    <Link href={`/admin/users/${user.id}`} className="flex items-center gap-4 flex-1 min-w-0">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${roleColor}`}>
                        <RoleIcon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{user.full_name || user.email}</span>
                          {user.is_beta && (
                            <span className="shrink-0 rounded-full bg-[#E7EDE9] px-2 py-0.5 text-[10px] font-medium text-[#1F3A2F]">
                              beta
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground truncate">
                          {user.full_name ? user.email : `Added ${new Date(user.created_at).toLocaleDateString()}`}
                        </div>
                      </div>
                    </Link>
                    <div className="flex items-center gap-3 shrink-0">
                      {isSuperAdmin ? (
                        <>
                          <label
                            className="flex items-center gap-1.5 text-xs text-muted-foreground"
                            title="Sees Searches and Pipeline before they open to everyone"
                          >
                            <Switch
                              checked={user.is_beta}
                              onCheckedChange={checked => handleUpdateBeta(user.id, checked)}
                              aria-label={`Beta access for ${user.full_name || user.email}`}
                            />
                            Beta
                          </label>
                          <Select
                            value={user.role}
                            onValueChange={(value) => handleUpdateRole(user.id, value)}
                          >
                            <SelectTrigger className="w-36">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="super_admin">Super Admin</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="recruiter">Recruiter</SelectItem>
                              <SelectItem value="scout">Scout</SelectItem>
                              <SelectItem value="hiring_manager">Hiring Manager</SelectItem>
                              <SelectItem value="viewer">Viewer</SelectItem>
                            </SelectContent>
                          </Select>
                          <Select
                            value={user.status}
                            onValueChange={(value) => handleUpdateStatus(user.id, value)}
                          >
                            <SelectTrigger className="w-28">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="inactive">Inactive</SelectItem>
                              <SelectItem value="pending">Pending</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteUser(user.id)}
                            className="text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <span className={`rounded-full px-3 py-1 text-xs font-medium ${roleColor}`}>
                            {user.role.replace('_', ' ')}
                          </span>
                          <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                            user.status === 'active' ? 'bg-green-100 text-green-700' :
                            user.status === 'inactive' ? 'bg-red-100 text-red-700' :
                            'bg-yellow-100 text-yellow-700'
                          }`}>
                            {user.status}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
            {users.length === 0 && (
              <p className="text-center text-muted-foreground py-8 text-sm">
                No users found
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Role Permissions Matrix - Redesigned */}
      <Card>
        <CardHeader className="px-4 sm:px-6">
          <CardTitle className="text-base sm:text-lg">Role Permissions</CardTitle>
          <CardDescription className="text-xs sm:text-sm">What each role can do in the system</CardDescription>
        </CardHeader>
        <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
          {/* Role Cards - Mobile Friendly */}
          <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {/* Super Admin */}
            <div className="rounded-xl border-2 border-purple-200 bg-purple-50/50 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100">
                  <ShieldCheck className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <h4 className="font-semibold text-purple-900">Super Admin</h4>
                  <p className="text-[10px] text-purple-600">Full system access</p>
                </div>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-2 text-purple-800">
                  <span className="w-4 h-4 rounded-full bg-purple-200 flex items-center justify-center text-[10px]">✓</span>
                  <span>Manage all users & roles</span>
                </div>
                <div className="flex items-center gap-2 text-purple-800">
                  <span className="w-4 h-4 rounded-full bg-purple-200 flex items-center justify-center text-[10px]">✓</span>
                  <span>Full admin panel access</span>
                </div>
                <div className="flex items-center gap-2 text-purple-800">
                  <span className="w-4 h-4 rounded-full bg-purple-200 flex items-center justify-center text-[10px]">✓</span>
                  <span>All CRUD operations</span>
                </div>
                <div className="flex items-center gap-2 text-purple-800">
                  <span className="w-4 h-4 rounded-full bg-purple-200 flex items-center justify-center text-[10px]">✓</span>
                  <span>Edit/delete companies</span>
                </div>
              </div>
            </div>

            {/* Admin */}
            <div className="rounded-xl border-2 border-blue-200 bg-blue-50/50 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
                  <Shield className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <h4 className="font-semibold text-blue-900">Admin</h4>
                  <p className="text-[10px] text-blue-600">Management access</p>
                </div>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-2 text-blue-800">
                  <span className="w-4 h-4 rounded-full bg-blue-200 flex items-center justify-center text-[10px]">✓</span>
                  <span>Admin panel & analytics</span>
                </div>
                <div className="flex items-center gap-2 text-blue-800">
                  <span className="w-4 h-4 rounded-full bg-blue-200 flex items-center justify-center text-[10px]">✓</span>
                  <span>View all data</span>
                </div>
                <div className="flex items-center gap-2 text-blue-800">
                  <span className="w-4 h-4 rounded-full bg-blue-200 flex items-center justify-center text-[10px]">✓</span>
                  <span>Edit/delete all jobs</span>
                </div>
                <div className="flex items-center gap-2 text-blue-800">
                  <span className="w-4 h-4 rounded-full bg-blue-200 flex items-center justify-center text-[10px]">✓</span>
                  <span>Edit/delete companies</span>
                </div>
                <div className="flex items-center gap-2 text-blue-800/60">
                  <span className="w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center text-[10px]">–</span>
                  <span>Cannot manage users</span>
                </div>
              </div>
            </div>

            {/* Recruiter */}
            <div className="rounded-xl border-2 border-green-200 bg-green-50/50 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
                  <User className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <h4 className="font-semibold text-green-900">Recruiter</h4>
                  <p className="text-[10px] text-green-600">Full recruiting access</p>
                </div>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-2 text-green-800">
                  <span className="w-4 h-4 rounded-full bg-green-200 flex items-center justify-center text-[10px]">✓</span>
                  <span>View all jobs</span>
                </div>
                <div className="flex items-center gap-2 text-green-800">
                  <span className="w-4 h-4 rounded-full bg-green-200 flex items-center justify-center text-[10px]">✓</span>
                  <span>Create & edit jobs (owned)</span>
                </div>
                <div className="flex items-center gap-2 text-green-800">
                  <span className="w-4 h-4 rounded-full bg-green-200 flex items-center justify-center text-[10px]">✓</span>
                  <span>Upload & edit candidates</span>
                </div>
                <div className="flex items-center gap-2 text-green-800">
                  <span className="w-4 h-4 rounded-full bg-green-200 flex items-center justify-center text-[10px]">✓</span>
                  <span>Send emails & notes</span>
                </div>
                <div className="flex items-center gap-2 text-green-800/60">
                  <span className="w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center text-[10px]">–</span>
                  <span>Cannot edit companies</span>
                </div>
              </div>
            </div>

            {/* Scout */}
            <div className="rounded-xl border-2 border-teal-200 bg-teal-50/50 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-100">
                  <Search className="h-4 w-4 text-teal-600" />
                </div>
                <div>
                  <h4 className="font-semibold text-teal-900">Scout</h4>
                  <p className="text-[10px] text-teal-600">Candidate sourcing</p>
                </div>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-2 text-teal-800">
                  <span className="w-4 h-4 rounded-full bg-teal-200 flex items-center justify-center text-[10px]">✓</span>
                  <span>Upload & edit candidates</span>
                </div>
                <div className="flex items-center gap-2 text-teal-800">
                  <span className="w-4 h-4 rounded-full bg-teal-200 flex items-center justify-center text-[10px]">✓</span>
                  <span>View owned items only</span>
                </div>
                <div className="flex items-center gap-2 text-teal-800">
                  <span className="w-4 h-4 rounded-full bg-teal-200 flex items-center justify-center text-[10px]">✓</span>
                  <span>Add recruiter notes</span>
                </div>
                <div className="flex items-center gap-2 text-teal-800/60">
                  <span className="w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center text-[10px]">–</span>
                  <span>Cannot create jobs</span>
                </div>
                <div className="flex items-center gap-2 text-teal-800/60">
                  <span className="w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center text-[10px]">–</span>
                  <span>Cannot edit companies</span>
                </div>
              </div>
            </div>

            {/* Hiring Manager */}
            <div className="rounded-xl border-2 border-orange-200 bg-orange-50/50 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100">
                  <Building className="h-4 w-4 text-orange-600" />
                </div>
                <div>
                  <h4 className="font-semibold text-orange-900">Hiring Manager</h4>
                  <p className="text-[10px] text-orange-600">Job owner access</p>
                </div>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-2 text-orange-800">
                  <span className="w-4 h-4 rounded-full bg-orange-200 flex items-center justify-center text-[10px]">✓</span>
                  <span>Create & edit owned jobs</span>
                </div>
                <div className="flex items-center gap-2 text-orange-800">
                  <span className="w-4 h-4 rounded-full bg-orange-200 flex items-center justify-center text-[10px]">✓</span>
                  <span>View assigned items</span>
                </div>
                <div className="flex items-center gap-2 text-orange-800">
                  <span className="w-4 h-4 rounded-full bg-orange-200 flex items-center justify-center text-[10px]">✓</span>
                  <span>View pipeline notes</span>
                </div>
                <div className="flex items-center gap-2 text-orange-800/60">
                  <span className="w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center text-[10px]">–</span>
                  <span>Cannot upload candidates</span>
                </div>
                <div className="flex items-center gap-2 text-orange-800/60">
                  <span className="w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center text-[10px]">–</span>
                  <span>Cannot edit companies</span>
                </div>
              </div>
            </div>

            {/* Viewer */}
            <div className="rounded-xl border-2 border-gray-200 bg-gray-50/50 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">
                  <Eye className="h-4 w-4 text-gray-600" />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900">Viewer</h4>
                  <p className="text-[10px] text-gray-600">Read-only access</p>
                </div>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-2 text-gray-800/60">
                  <span className="w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center text-[10px]">–</span>
                  <span>No create permissions</span>
                </div>
                <div className="flex items-center gap-2 text-gray-800/60">
                  <span className="w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center text-[10px]">–</span>
                  <span>No edit permissions</span>
                </div>
                <div className="flex items-center gap-2 text-gray-800/60">
                  <span className="w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center text-[10px]">–</span>
                  <span>No delete permissions</span>
                </div>
                <div className="flex items-center gap-2 text-gray-800/60">
                  <span className="w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center text-[10px]">–</span>
                  <span>Limited visibility</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Reference Legend */}
          <div className="mt-6 pt-4 border-t">
            <h5 className="text-xs font-medium text-muted-foreground mb-3">Quick Reference: Key Permissions</h5>
            <div className="grid gap-2 sm:gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 text-xs">
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg">
                <span className="font-medium">Edit/Delete Companies:</span>
                <span className="text-purple-600">Super</span>
                <span className="text-blue-600">Admin</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg">
                <span className="font-medium">Delete Jobs:</span>
                <span className="text-purple-600">Super</span>
                <span className="text-blue-600">Admin</span>
                <span className="text-muted-foreground">+ Owner</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg">
                <span className="font-medium">Manage Users:</span>
                <span className="text-purple-600">Super Only</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg">
                <span className="font-medium">Upload Resumes:</span>
                <span className="text-purple-600">Super</span>
                <span className="text-blue-600">Admin</span>
                <span className="text-green-600">Rec</span>
                <span className="text-teal-600">Scout</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
