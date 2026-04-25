'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import type { RecruiterNote } from '@/lib/types'
import { MessageSquare, Phone, DollarSign, MapPin, Clock, Star, Trash2, Plus, Lock } from 'lucide-react'

const noteTypeIcons = {
  general: MessageSquare,
  call: Phone,
  salary: DollarSign,
  location: MapPin,
  availability: Clock,
  feedback: Star,
}

const noteTypeLabels = {
  general: 'General Note',
  call: 'Call Notes',
  salary: 'Salary Discussion',
  location: 'Location/Relocation',
  availability: 'Availability',
  feedback: 'Feedback',
}

const noteTypeColors = {
  general: 'bg-gray-100 text-gray-700',
  call: 'bg-blue-100 text-blue-700',
  salary: 'bg-green-100 text-green-700',
  location: 'bg-purple-100 text-purple-700',
  availability: 'bg-orange-100 text-orange-700',
  feedback: 'bg-yellow-100 text-yellow-700',
}

interface RecruiterNotesProps {
  candidateId: string
}

export function RecruiterNotes({ candidateId }: RecruiterNotesProps) {
  const [notes, setNotes] = useState<RecruiterNote[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  const [showForm, setShowForm] = useState(false)
  
  // Form state
  const [noteType, setNoteType] = useState<string>('general')
  const [content, setContent] = useState('')

  useEffect(() => {
    fetchNotes()
  }, [candidateId])

  async function fetchNotes() {
    try {
      const res = await fetch(`/api/candidates/${candidateId}/notes`)
      if (res.ok) {
        const data = await res.json()
        setNotes(data.notes)
      }
    } catch (error) {
      console.error('Error fetching notes:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim()) return

    setIsAdding(true)
    try {
      const res = await fetch(`/api/candidates/${candidateId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note_type: noteType, content }),
      })

      if (res.ok) {
        await fetchNotes()
        setContent('')
        setNoteType('general')
        setShowForm(false)
      }
    } catch (error) {
      console.error('Error adding note:', error)
    } finally {
      setIsAdding(false)
    }
  }

  async function handleDeleteNote(noteId: string) {
    if (!confirm('Delete this note?')) return

    try {
      const res = await fetch(`/api/candidates/${candidateId}/notes/${noteId}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        setNotes(notes.filter(n => n.id !== noteId))
      }
    } catch (error) {
      console.error('Error deleting note:', error)
    }
  }

  function formatDate(dateString: string) {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) {
      return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    } else if (diffDays === 1) {
      return `Yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    } else if (diffDays < 7) {
      return `${diffDays} days ago`
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4 text-muted-foreground" />
            Recruiter Notes
          </CardTitle>
          <CardDescription>
            Private notes visible only to recruiters
          </CardDescription>
        </div>
        {!showForm && (
          <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Note
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm && (
          <form onSubmit={handleAddNote} className="space-y-3 rounded-lg border p-4 bg-muted/30">
            <Select value={noteType} onValueChange={setNoteType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General Note</SelectItem>
                <SelectItem value="call">Call Notes</SelectItem>
                <SelectItem value="salary">Salary Discussion</SelectItem>
                <SelectItem value="location">Location/Relocation</SelectItem>
                <SelectItem value="availability">Availability</SelectItem>
                <SelectItem value="feedback">Feedback</SelectItem>
              </SelectContent>
            </Select>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Add your note here..."
              rows={3}
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={isAdding || !content.trim()}>
                {isAdding && <Spinner className="mr-2 h-4 w-4" />}
                Save Note
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner className="h-6 w-6" />
          </div>
        ) : notes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No notes yet. Add the first note to track conversations and details.
          </p>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => {
              const Icon = noteTypeIcons[note.note_type as keyof typeof noteTypeIcons] || MessageSquare
              const color = noteTypeColors[note.note_type as keyof typeof noteTypeColors] || 'bg-gray-100 text-gray-700'
              const label = noteTypeLabels[note.note_type as keyof typeof noteTypeLabels] || 'Note'

              return (
                <div key={note.id} className="rounded-lg border p-3 group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
                        <Icon className="h-3 w-3" />
                        {label}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(note.created_at)}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleDeleteNote(note.id)}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                  <p className="mt-2 text-sm text-foreground whitespace-pre-wrap">{note.content}</p>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
