'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MessageSquare, Plus, Clock } from 'lucide-react'
import type { CompanyNote } from '@/lib/types'

interface CompanyNotesProps {
  companyId: string
}

const noteTypeLabels: Record<string, { label: string; color: string }> = {
  general: { label: 'General', color: 'bg-gray-100 text-gray-700' },
  strategy: { label: 'Strategy', color: 'bg-blue-100 text-blue-700' },
  contact: { label: 'Contact', color: 'bg-green-100 text-green-700' },
  hiring: { label: 'Hiring', color: 'bg-purple-100 text-purple-700' },
  gtm: { label: 'GTM', color: 'bg-amber-100 text-amber-700' },
}

export function CompanyNotes({ companyId }: CompanyNotesProps) {
  const [notes, setNotes] = useState<CompanyNote[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  const [newNote, setNewNote] = useState('')
  const [noteType, setNoteType] = useState('general')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    fetchNotes()
  }, [companyId])

  const fetchNotes = async () => {
    try {
      const res = await fetch(`/api/companies/${companyId}/notes`)
      if (res.ok) {
        const data = await res.json()
        setNotes(data)
      }
    } catch (error) {
      console.error('Failed to fetch notes:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddNote = async () => {
    if (!newNote.trim()) return

    setIsSaving(true)
    try {
      const res = await fetch(`/api/companies/${companyId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note_type: noteType,
          content: newNote,
        }),
      })

      if (res.ok) {
        const note = await res.json()
        setNotes([note, ...notes])
        setNewNote('')
        setNoteType('general')
        setIsAdding(false)
      }
    } catch (error) {
      console.error('Failed to add note:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Team Notes
          </CardTitle>
          {!isAdding && (
            <Button variant="ghost" size="sm" onClick={() => setIsAdding(true)}>
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isAdding && (
          <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
            <div className="flex gap-2">
              <Select value={noteType} onValueChange={setNoteType}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="strategy">Strategy</SelectItem>
                  <SelectItem value="contact">Contact</SelectItem>
                  <SelectItem value="hiring">Hiring</SelectItem>
                  <SelectItem value="gtm">GTM</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Textarea
              placeholder="Add a note about this company..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              rows={3}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAddNote} disabled={isSaving || !newNote.trim()}>
                {isSaving ? 'Saving...' : 'Save Note'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setIsAdding(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Loading notes...</p>
        ) : notes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No notes yet. Add one to share with your team.
          </p>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => (
              <div key={note.id} className="border-l-2 border-border pl-3 py-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${noteTypeLabels[note.note_type]?.color || noteTypeLabels.general.color}`}>
                    {noteTypeLabels[note.note_type]?.label || 'General'}
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDate(note.created_at)}
                  </span>
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap">{note.content}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
