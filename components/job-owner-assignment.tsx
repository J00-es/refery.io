'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { User, Search, Check, X, Loader2 } from 'lucide-react'

interface JobOwnerAssignmentProps {
  jobId: string
  currentOwner: { email: string; full_name: string | null } | null
  currentOwnerId: string | null
}

interface UserOption {
  user_id: string
  email: string
  full_name: string | null
  role?: string
}

const roleColors: Record<string, string> = {
  super_admin: 'bg-purple-100 text-purple-700',
  admin: 'bg-blue-100 text-blue-700',
  recruiter: 'bg-green-100 text-green-700',
  scout: 'bg-teal-100 text-teal-700',
  hiring_manager: 'bg-orange-100 text-orange-700',
  viewer: 'bg-gray-100 text-gray-700',
}

export function JobOwnerAssignment({ jobId, currentOwner, currentOwnerId }: JobOwnerAssignmentProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [users, setUsers] = useState<UserOption[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [owner, setOwner] = useState(currentOwner)
  const [ownerId, setOwnerId] = useState(currentOwnerId)
  const supabase = createClient()

  useEffect(() => {
    if (isEditing) {
      searchUsers('')
    }
  }, [isEditing])

  async function searchUsers(term: string) {
    setLoading(true)
    // Show all users with a valid user_id (meaning they've logged in at least once)
    let query = supabase
      .from('users_admin')
      .select('user_id, email, full_name, role')
      .not('user_id', 'is', null)  // Only show users who have logged in
      .order('full_name')
      .limit(20)

    if (term) {
      query = query.or(`email.ilike.%${term}%,full_name.ilike.%${term}%`)
    }

    const { data } = await query
    setUsers(data || [])
    setLoading(false)
  }

  async function assignOwner(userId: string, user: UserOption) {
    setSaving(true)
    const { error } = await supabase
      .from('jobs')
      .update({ owner_user_id: userId })
      .eq('id', jobId)

    if (!error) {
      setOwner({ email: user.email, full_name: user.full_name })
      setOwnerId(userId)
      setIsEditing(false)
    }
    setSaving(false)
  }

  async function removeOwner() {
    setSaving(true)
    const { error } = await supabase
      .from('jobs')
      .update({ owner_user_id: null })
      .eq('id', jobId)

    if (!error) {
      setOwner(null)
      setOwnerId(null)
    }
    setSaving(false)
  }

  if (!isEditing) {
    return (
      <div className="flex items-center justify-between">
        {owner ? (
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {owner.full_name || owner.email}
              </p>
              {owner.full_name && (
                <p className="text-xs text-muted-foreground">{owner.email}</p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No owner assigned</p>
        )}
        <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
          {owner ? 'Change' : 'Assign'}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search team members..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              searchUsers(e.target.value)
            }}
            className="pl-9 h-9"
            autoFocus
          />
        </div>
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setIsEditing(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="max-h-48 overflow-y-auto border rounded-lg divide-y">
        {loading ? (
          <div className="p-4 text-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mx-auto" />
          </div>
        ) : users.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No team members found
          </div>
        ) : (
          users.map((user) => (
            <button
              key={user.user_id}
              onClick={() => assignOwner(user.user_id, user)}
              disabled={saving}
              className="w-full flex items-center justify-between p-2.5 text-left hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">{user.full_name || user.email}</p>
                  <div className="flex items-center gap-2">
                    {user.full_name && (
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    )}
                    {user.role && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${roleColors[user.role] || 'bg-gray-100 text-gray-600'}`}>
                        {user.role.replace('_', ' ')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {user.user_id === ownerId && (
                <Check className="h-4 w-4 text-primary" />
              )}
            </button>
          ))
        )}
      </div>

      {owner && (
        <Button 
          variant="ghost" 
          size="sm" 
          className="w-full text-red-500 hover:text-red-600 hover:bg-red-50"
          onClick={removeOwner}
          disabled={saving}
        >
          Remove Owner
        </Button>
      )}
    </div>
  )
}
