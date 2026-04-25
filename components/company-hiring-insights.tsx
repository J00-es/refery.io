'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Lightbulb, Edit2, Save, X } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'

interface CompanyHiringInsightsProps {
  companyId: string
  insights: string | null
  canEdit?: boolean
  variant?: 'full' | 'compact'
}

export function CompanyHiringInsights({ 
  companyId, 
  insights: initialInsights, 
  canEdit = false,
  variant = 'full'
}: CompanyHiringInsightsProps) {
  const [insights, setInsights] = useState(initialInsights || '')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editValue, setEditValue] = useState(insights)

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/companies/${companyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hiring_insights: editValue || null }),
      })

      if (res.ok) {
        setInsights(editValue)
        setEditing(false)
      }
    } catch (error) {
      console.error('Failed to save insights:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setEditValue(insights)
    setEditing(false)
  }

  if (variant === 'compact') {
    return (
      <Card className="bg-amber-50/50 border-amber-200">
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-sm flex items-center gap-2 text-amber-800">
            <Lightbulb className="h-4 w-4" />
            Company Hiring Insights
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          {insights ? (
            <div className="text-sm text-amber-900 whitespace-pre-wrap">
              {insights}
            </div>
          ) : (
            <p className="text-sm text-amber-700/70 italic">
              No hiring insights available for this company yet.
            </p>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="px-4 sm:px-6 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Lightbulb className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500" />
              Hiring Insights
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Company hiring taste, trends, and preferences
            </CardDescription>
          </div>
          {canEdit && !editing && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                setEditValue(insights)
                setEditing(true)
              }}
            >
              <Edit2 className="h-4 w-4 mr-1" />
              Edit
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
        {editing ? (
          <div className="space-y-3">
            <Textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              placeholder="Add insights about hiring preferences, interview process, team culture, what they look for in candidates..."
              rows={6}
              className="text-sm"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={handleCancel} disabled={saving}>
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Spinner className="h-4 w-4 mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                Save
              </Button>
            </div>
          </div>
        ) : insights ? (
          <div className="prose prose-sm max-w-none text-sm text-muted-foreground whitespace-pre-wrap">
            {insights}
          </div>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <Lightbulb className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No hiring insights added yet</p>
            {canEdit && (
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-3"
                onClick={() => setEditing(true)}
              >
                <Edit2 className="h-4 w-4 mr-1" />
                Add Insights
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
