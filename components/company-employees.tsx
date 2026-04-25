'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Users, Plus, Linkedin, Mail, Phone, User } from 'lucide-react'
import type { CompanyEmployee } from '@/lib/types'

interface CompanyEmployeesProps {
  companyId: string
}

export function CompanyEmployees({ companyId }: CompanyEmployeesProps) {
  const [employees, setEmployees] = useState<CompanyEmployee[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    fetchEmployees()
  }, [companyId])

  const fetchEmployees = async () => {
    try {
      const res = await fetch(`/api/companies/${companyId}/employees`)
      if (res.ok) {
        const data = await res.json()
        setEmployees(data)
      }
    } catch (error) {
      console.error('Failed to fetch employees:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddEmployee = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSaving(true)

    const formData = new FormData(e.currentTarget)
    const employeeData = {
      name: formData.get('name'),
      title: formData.get('title') || null,
      linkedin_url: formData.get('linkedin_url') || null,
      email: formData.get('email') || null,
      phone: formData.get('phone') || null,
      notes: formData.get('notes') || null,
      cv_content: formData.get('cv_content') || null,
    }

    try {
      const res = await fetch(`/api/companies/${companyId}/employees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(employeeData),
      })

      if (res.ok) {
        const employee = await res.json()
        setEmployees([...employees, employee])
        setIsDialogOpen(false)
      }
    } catch (error) {
      console.error('Failed to add employee:', error)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Key Contacts
            </CardTitle>
            <CardDescription>
              Important people at this company
            </CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Add Contact
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Add Contact</DialogTitle>
                <DialogDescription>
                  Add a key contact or employee profile
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddEmployee} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name *</Label>
                    <Input id="name" name="name" required placeholder="John Smith" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="title">Title</Label>
                    <Input id="title" name="title" placeholder="CTO, VP Engineering, etc." />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" name="email" type="email" placeholder="john@company.com" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input id="phone" name="phone" placeholder="+1 555-123-4567" />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="linkedin_url">LinkedIn URL</Label>
                    <Input id="linkedin_url" name="linkedin_url" type="url" placeholder="https://linkedin.com/in/..." />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea id="notes" name="notes" rows={2} placeholder="Key points about this person..." />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="cv_content">CV / Background Info</Label>
                    <Textarea 
                      id="cv_content" 
                      name="cv_content" 
                      rows={4} 
                      placeholder="Paste CV content, background info, or career history here..."
                    />
                    <p className="text-xs text-muted-foreground">
                      You can paste their CV or LinkedIn profile content for reference
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSaving}>
                    {isSaving ? 'Saving...' : 'Add Contact'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Loading contacts...</p>
        ) : employees.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No contacts added yet
          </p>
        ) : (
          <div className="space-y-4">
            {employees.map((employee) => (
              <div key={employee.id} className="border rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                      <User className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{employee.name}</p>
                      {employee.title && (
                        <p className="text-sm text-muted-foreground">{employee.title}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        {employee.linkedin_url && (
                          <a href={employee.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                            <Linkedin className="h-4 w-4" />
                          </a>
                        )}
                        {employee.email && (
                          <a href={`mailto:${employee.email}`} className="text-primary hover:underline">
                            <Mail className="h-4 w-4" />
                          </a>
                        )}
                        {employee.phone && (
                          <a href={`tel:${employee.phone}`} className="text-primary hover:underline">
                            <Phone className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                {employee.notes && (
                  <p className="mt-3 text-sm text-muted-foreground border-t pt-3">
                    {employee.notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
