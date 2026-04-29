'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Mail, Linkedin, Phone, MessageSquare, TrendingUp, TrendingDown, Send, MessageCircle, Calendar, Users } from 'lucide-react'

interface OutreachKPICardsProps {
  touches: number
  touchesChange: number
  channelBreakdown: Record<string, number>
  sparkline: number[]
  replyRate: number
  replyRateChange: number
  meetingsBooked: number
  activeThreads: number
}

function Sparkline({ data, className = '' }: { data: number[]; className?: string }) {
  if (data.length === 0) return null
  
  const max = Math.max(...data, 1)
  const height = 32
  const width = 80
  const points = data.map((value, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - (value / max) * height
    return `${x},${y}`
  }).join(' ')

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={`${className}`} preserveAspectRatio="none">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  )
}

function getChannelIcon(channel: string) {
  switch (channel) {
    case 'email': return <Mail className="h-3 w-3" />
    case 'linkedin_connection':
    case 'linkedin_dm': return <Linkedin className="h-3 w-3" />
    case 'phone': return <Phone className="h-3 w-3" />
    default: return <MessageSquare className="h-3 w-3" />
  }
}

export function OutreachKPICards({
  touches,
  touchesChange,
  channelBreakdown,
  sparkline,
  replyRate,
  replyRateChange,
  meetingsBooked,
  activeThreads
}: OutreachKPICardsProps) {
  const topChannels = Object.entries(channelBreakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* Touches */}
      <Card className="border-border">
        <CardContent className="pt-5 pb-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Touches (7d)</p>
              <p className="text-3xl font-semibold font-mono mt-1">{touches}</p>
            </div>
            <div className="w-20 h-8 text-emerald-500">
              <Sparkline data={sparkline} className="w-full h-full" />
            </div>
          </div>
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border">
            {topChannels.map(([channel, count]) => (
              <div key={channel} className="flex items-center gap-1 text-muted-foreground">
                {getChannelIcon(channel)}
                <span className="text-xs font-mono">{count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Reply Rate */}
      <Card className="border-border">
        <CardContent className="pt-5 pb-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Reply Rate (30d)</p>
              <p className="text-3xl font-semibold font-mono mt-1">{replyRate}%</p>
            </div>
            <div className={`flex items-center gap-1 text-sm font-mono ${replyRateChange >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {replyRateChange >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              {replyRateChange >= 0 ? '+' : ''}{replyRateChange}%
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
            vs. prior 30 days
          </p>
        </CardContent>
      </Card>

      {/* Meetings Booked */}
      <Card className="border-border">
        <CardContent className="pt-5 pb-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Meetings (MTD)</p>
              <p className="text-3xl font-semibold font-mono mt-1">{meetingsBooked}</p>
            </div>
            <Calendar className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
            Booked this month
          </p>
        </CardContent>
      </Card>

      {/* Active Threads */}
      <Card className="border-border">
        <CardContent className="pt-5 pb-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Active Threads</p>
              <p className="text-3xl font-semibold font-mono mt-1">{activeThreads}</p>
            </div>
            <MessageCircle className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
            Awaiting reply or active
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
