'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog'
import { Users, Plus, Linkedin, Mail, Trash2, Edit2, User } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'

interface Contact {
  id: string
  company_id: string
  name: string
  email: string | null
  linkedin_url: string | null
  title: string | null
  notes: string | null
  created_at: string
}

interface CompanyContactsProps {
  companyId: string
  canEdit?: boolean
}

export function CompanyContacts({ companyId, canEdit = false }: CompanyContactsProps) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const [saving, setSaving] = useState(false)
  
  const [formData, setFormData] = useState({
    name: '',
    title: '',
    email: '',
    linkedin_url: '',
    notes: '',
  })

  useEffect(() => {
    fetchContacts()
  }, [companyId])

  const fetchContacts = async () => {
    try {
      const res = await fetch(`/api/companies/${companyId}/contacts`)
      if (res.ok) {
        const data = await res.json()
        setContacts(data)
      }
    } catch (error) {
      console.error('Failed to fetch contacts:', error)
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setFormData({ name: '', title: '', email: '', linkedin_url: '', notes: '' })
    setEditingContact(null)
  }

  const handleOpenDialog = (contact?: Contact) => {
    if (contact) {
      setEditingContact(contact)
      setFormData({
        name: contact.name,
        title: contact.title || '',
        email: contact.email || '',
        linkedin_url: contact.linkedin_url || '',
        notes: contact.notes || '',
      })
    } else {
      resetForm()
    }
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) return
    
    setSaving(true)
    try {
      const url = editingContact 
        ? `/api/companies/${companyId}/contacts/${editingContact.id}`
        : `/api/companies/${companyId}/contacts`
      
      const res = await fetch(url, {
        method: editingContact ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (res.ok) {
        await fetchContacts()
        setDialogOpen(false)
        resetForm()
      }
    } catch (error) {
      console.error('Failed to save contact:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (contactId: string) => {
    if (!confirm('Are you sure you want to delete this contact?')) return
    
    try {
      const res = await fetch(`/api/companies/${companyId}/contacts/${contactId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setContacts(contacts.filter(c => c.id !== contactId))
      }
    } catch (error) {
      console.error('Failed to delete contact:', error)
    }
  }

  return (
    <Card>
      <CardHeader className="px-4 sm:px-6 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Users className="h-4 w-4 sm:h-5 sm:w-5" />
              Company Contacts
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Key contacts at this company
            </CardDescription>
          </div>
          {canEdit && (
            <Dialog open={dialogOpen} onOpenChange={(open) => {
              setDialogOpen(open)
              if (!open) resetForm()
            }}>
              <DialogTrigger asChild>
                <Button size="sm" onClick={() => handleOpenDialog()}>
                  <Plus className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">Add Contact</span>
                  <span className="sm:hidden">Add</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>
                    {editingContact ? 'Edit Contact' : 'Add New Contact'}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Contact name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="title">Title/Role</Label>
                    <Input
                      id="title"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="e.g., VP Engineering, Hiring Manager"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="contact@company.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="linkedin">LinkedIn URL</Label>
                    <Input
                      id="linkedin"
                      value={formData.linkedin_url}
                      onChange={(e) => setFormData({ ...formData, linkedin_url: e.target.value })}
                      placeholder="https://linkedin.com/in/..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Additional notes about this contact..."
                      rows={3}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Cancel</Button>
                  </DialogClose>
                  <Button onClick={handleSave} disabled={!formData.name.trim() || saving}>
                    {saving && <Spinner className="mr-2 h-4 w-4" />}
                    {editingContact ? 'Save Changes' : 'Add Contact'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner className="h-6 w-6" />
          </div>
        ) : contacts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <User className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No contacts added yet</p>
            {canEdit && (
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-3"
                onClick={() => handleOpenDialog()}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add First Contact
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {contacts.map((contact) => (
              <div 
                key={contact.id}
                className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-medium">
                  {contact.name[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{contact.name}</span>
                    {contact.title && (
                      <span className="text-xs text-muted-foreground">• {contact.title}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    {contact.email && (
                      <a 
                        href={`mailto:${contact.email}`}
                        className="flex items-center gap-1 hover:text-primary transition-colors"
                      >
                        <Mail className="h-3 w-3" />
                        <span className="truncate max-w-[150px]">{contact.email}</span>
                      </a>
                    )}
                    {contact.linkedin_url && (
                      <a 
                        href={contact.linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 hover:text-primary transition-colors"
                      >
                        <Linkedin className="h-3 w-3" />
                        LinkedIn
                      </a>
                    )}
                  </div>
                  {contact.notes && (
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                      {contact.notes}
                    </p>
                  )}
                </div>
                {canEdit && (
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleOpenDialog(contact)}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(contact.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
