import { createClient, createAdminClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { subDays, subMonths, startOfWeek, format, eachDayOfInterval } from 'date-fns'
import { ArrowLeft, TrendingUp, TrendingDown, Mail, Linkedin, Phone, Calendar, Users, MessageSquare, Target } from 'lucide-react'
import { PERSONA_CONFIG, PATTERN_CONFIG, STATUS_CONFIG, type OutreachMessage, type OutreachThread, type OutreachRecipient } from '@/lib/outreach-types'
import { InsightsCharts } from './insights-charts'

const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']

export default async function InsightsPage() {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()

  const now = new Date()
  const thirtyDaysAgo = subDays(now, 30)
  const sixtyDaysAgo = subDays(now, 60)
  const ninetyDaysAgo = subDays(now, 90)

  // Fetch comprehensive data
  const [
    messagesResult,
    priorMessagesResult,
    threadsResult,
    recipientsResult
  ] = await Promise.all([
    // Messages last 30 days
    adminClient
      .from('outreach_messages')
      .select('*')
      .gte('sent_at', thirtyDaysAgo.toISOString()),
    // Messages prior 30 days (for comparison)
    adminClient
      .from('outreach_messages')
      .select('*')
      .gte('sent_at', sixtyDaysAgo.toISOString())
      .lt('sent_at', thirtyDaysAgo.toISOString()),
    // All threads
    adminClient
      .from('outreach_threads')
      .select('*'),
    // All recipients
    adminClient
      .from('outreach_recipients')
      .select('id, persona, lifetime_touches, lifetime_replies')
  ])

  const messages = (messagesResult.data || []) as OutreachMessage[]
  const priorMessages = (priorMessagesResult.data || []) as OutreachMessage[]
  const threads = (threadsResult.data || []) as OutreachThread[]
  const recipients = (recipientsResult.data || []) as OutreachRecipient[]

  // Calculate KPIs
  const outbound = messages.filter(m => m.direction === 'outbound')
  const inbound = messages.filter(m => m.direction === 'inbound')
  const priorOutbound = priorMessages.filter(m => m.direction === 'outbound')
  const priorInbound = priorMessages.filter(m => m.direction === 'inbound')

  const replyRate = outbound.length > 0 ? Math.round((inbound.length / outbound.length) * 100) : 0
  const priorReplyRate = priorOutbound.length > 0 ? Math.round((priorInbound.length / priorOutbound.length) * 100) : 0
  const replyRateChange = replyRate - priorReplyRate

  // Meetings
  const meetingsThisMonth = threads.filter(t => 
    t.meeting_booked_at && new Date(t.meeting_booked_at) >= new Date(now.getFullYear(), now.getMonth(), 1)
  ).length

  // Average time to first reply
  const threadsTTFR = threads.filter(t => t.time_to_first_reply_hours !== null)
  const avgTTFR = threadsTTFR.length > 0
    ? Math.round(threadsTTFR.reduce((sum, t) => sum + (t.time_to_first_reply_hours || 0), 0) / threadsTTFR.length)
    : 0

  // Channel breakdown
  const channelStats = outbound.reduce((acc, m) => {
    acc[m.channel] = acc[m.channel] || { sent: 0, replied: 0 }
    acc[m.channel].sent++
    if (m.replied_at) acc[m.channel].replied++
    return acc
  }, {} as Record<string, { sent: number; replied: number }>)

  // Pattern performance
  const patternStats = threads.reduce((acc, t) => {
    const pattern = t.outreach_pattern || 'other'
    acc[pattern] = acc[pattern] || { threads: 0, replied: 0, meetings: 0 }
    acc[pattern].threads++
    if (t.first_reply_at) acc[pattern].replied++
    if (t.meeting_booked_at) acc[pattern].meetings++
    return acc
  }, {} as Record<string, { threads: number; replied: number; meetings: number }>)

  // Persona performance
  const recipientMap = new Map(recipients.map(r => [r.id, r]))
  const personaStats = threads.reduce((acc, t) => {
    const recipient = recipientMap.get(t.recipient_id)
    const persona = recipient?.persona || 'other'
    acc[persona] = acc[persona] || { threads: 0, replied: 0, meetings: 0 }
    acc[persona].threads++
    if (t.first_reply_at) acc[persona].replied++
    if (t.meeting_booked_at) acc[persona].meetings++
    return acc
  }, {} as Record<string, { threads: number; replied: number; meetings: number }>)

  // Hook performance
  const hookStats = outbound.reduce((acc, m) => {
    const hook = m.hook_used || 'none'
    acc[hook] = acc[hook] || { sent: 0, replied: 0 }
    acc[hook].sent++
    if (m.replied_at) acc[hook].replied++
    return acc
  }, {} as Record<string, { sent: number; replied: number }>)

  // Day of week performance
  const dayStats = outbound.reduce((acc, m) => {
    if (!m.sent_at) return acc
    const day = format(new Date(m.sent_at), 'EEEE')
    acc[day] = acc[day] || { sent: 0, replied: 0 }
    acc[day].sent++
    if (m.replied_at) acc[day].replied++
    return acc
  }, {} as Record<string, { sent: number; replied: number }>)

  // Daily volume for chart (last 30 days)
  const dailyVolume = eachDayOfInterval({ start: thirtyDaysAgo, end: now }).map(day => {
    const dayStr = format(day, 'yyyy-MM-dd')
    const dayOutbound = outbound.filter(m => m.sent_at && format(new Date(m.sent_at), 'yyyy-MM-dd') === dayStr)
    const dayInbound = inbound.filter(m => m.sent_at && format(new Date(m.sent_at), 'yyyy-MM-dd') === dayStr)
    return {
      date: format(day, 'MMM d'),
      outbound: dayOutbound.length,
      inbound: dayInbound.length
    }
  })

  // Status distribution
  const statusCounts = threads.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/outreach">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Hub
              </Link>
            </Button>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Outreach Insights</h1>
          <p className="text-sm text-muted-foreground">Performance analytics for the last 30 days</p>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs font-medium text-muted-foreground uppercase">Touches Sent</p>
            <p className="text-3xl font-semibold font-mono mt-1">{outbound.length}</p>
            <div className={`flex items-center gap-1 mt-2 text-xs ${outbound.length - priorOutbound.length >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {outbound.length - priorOutbound.length >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {Math.abs(outbound.length - priorOutbound.length)} vs prior 30d
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs font-medium text-muted-foreground uppercase">Replies</p>
            <p className="text-3xl font-semibold font-mono mt-1">{inbound.length}</p>
            <div className={`flex items-center gap-1 mt-2 text-xs ${inbound.length - priorInbound.length >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {inbound.length - priorInbound.length >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {Math.abs(inbound.length - priorInbound.length)} vs prior 30d
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs font-medium text-muted-foreground uppercase">Reply Rate</p>
            <p className="text-3xl font-semibold font-mono mt-1">{replyRate}%</p>
            <div className={`flex items-center gap-1 mt-2 text-xs ${replyRateChange >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {replyRateChange >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {Math.abs(replyRateChange)}pp vs prior 30d
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs font-medium text-muted-foreground uppercase">Meetings Booked</p>
            <p className="text-3xl font-semibold font-mono mt-1">{meetingsThisMonth}</p>
            <p className="text-xs text-muted-foreground mt-2">This month</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs font-medium text-muted-foreground uppercase">Avg. Time to Reply</p>
            <p className="text-3xl font-semibold font-mono mt-1">{avgTTFR}h</p>
            <p className="text-xs text-muted-foreground mt-2">First response</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <InsightsCharts
        dailyVolume={dailyVolume}
        channelStats={channelStats}
        patternStats={patternStats}
        personaStats={personaStats}
        statusCounts={statusCounts}
        dayStats={dayStats}
        hookStats={hookStats}
      />

      {/* Detailed Tables */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pattern Performance */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Pattern Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(patternStats)
                .sort((a, b) => b[1].threads - a[1].threads)
                .map(([pattern, stats]) => {
                  const config = PATTERN_CONFIG[pattern as keyof typeof PATTERN_CONFIG]
                  const rr = stats.threads > 0 ? Math.round((stats.replied / stats.threads) * 100) : 0
                  const mr = stats.threads > 0 ? Math.round((stats.meetings / stats.threads) * 100) : 0
                  return (
                    <div key={pattern} className="flex items-center justify-between py-2 border-b last:border-b-0">
                      <div>
                        <p className="text-sm font-medium">{config?.label || pattern}</p>
                        <p className="text-xs text-muted-foreground">{stats.threads} threads</p>
                      </div>
                      <div className="flex items-center gap-4 text-right">
                        <div>
                          <p className="text-sm font-mono">{rr}%</p>
                          <p className="text-[10px] text-muted-foreground">reply</p>
                        </div>
                        <div>
                          <p className="text-sm font-mono text-emerald-600">{mr}%</p>
                          <p className="text-[10px] text-muted-foreground">meeting</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
            </div>
          </CardContent>
        </Card>

        {/* Persona Performance */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Persona Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(personaStats)
                .sort((a, b) => b[1].threads - a[1].threads)
                .map(([persona, stats]) => {
                  const config = PERSONA_CONFIG[persona as keyof typeof PERSONA_CONFIG]
                  const rr = stats.threads > 0 ? Math.round((stats.replied / stats.threads) * 100) : 0
                  const mr = stats.threads > 0 ? Math.round((stats.meetings / stats.threads) * 100) : 0
                  return (
                    <div key={persona} className="flex items-center justify-between py-2 border-b last:border-b-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${config?.bgColor || 'bg-stone-100'} ${config?.color || 'text-stone-600'}`}>
                          {config?.label || persona}
                        </span>
                        <span className="text-xs text-muted-foreground">{stats.threads}</span>
                      </div>
                      <div className="flex items-center gap-4 text-right">
                        <div>
                          <p className="text-sm font-mono">{rr}%</p>
                          <p className="text-[10px] text-muted-foreground">reply</p>
                        </div>
                        <div>
                          <p className="text-sm font-mono text-emerald-600">{mr}%</p>
                          <p className="text-[10px] text-muted-foreground">meeting</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
            </div>
          </CardContent>
        </Card>

        {/* Channel Performance */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Channel Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(channelStats)
                .sort((a, b) => b[1].sent - a[1].sent)
                .map(([channel, stats]) => {
                  const rr = stats.sent > 0 ? Math.round((stats.replied / stats.sent) * 100) : 0
                  return (
                    <div key={channel} className="flex items-center justify-between py-2 border-b last:border-b-0">
                      <div className="flex items-center gap-2">
                        {channel === 'email' && <Mail className="h-4 w-4 text-muted-foreground" />}
                        {channel.includes('linkedin') && <Linkedin className="h-4 w-4 text-muted-foreground" />}
                        {channel === 'phone' && <Phone className="h-4 w-4 text-muted-foreground" />}
                        <span className="text-sm">{channel.replace('_', ' ')}</span>
                      </div>
                      <div className="flex items-center gap-4 text-right">
                        <div>
                          <p className="text-sm font-mono">{stats.sent}</p>
                          <p className="text-[10px] text-muted-foreground">sent</p>
                        </div>
                        <div>
                          <p className="text-sm font-mono">{stats.replied}</p>
                          <p className="text-[10px] text-muted-foreground">replied</p>
                        </div>
                        <div>
                          <p className="text-sm font-mono text-emerald-600">{rr}%</p>
                          <p className="text-[10px] text-muted-foreground">rate</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
            </div>
          </CardContent>
        </Card>

        {/* Day of Week */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Best Days to Send</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
                .filter(day => dayStats[day])
                .sort((a, b) => {
                  const rateA = dayStats[a].sent > 0 ? dayStats[a].replied / dayStats[a].sent : 0
                  const rateB = dayStats[b].sent > 0 ? dayStats[b].replied / dayStats[b].sent : 0
                  return rateB - rateA
                })
                .map((day, i) => {
                  const stats = dayStats[day]
                  const rr = stats.sent > 0 ? Math.round((stats.replied / stats.sent) * 100) : 0
                  return (
                    <div key={day} className="flex items-center justify-between py-2 border-b last:border-b-0">
                      <div className="flex items-center gap-2">
                        {i === 0 && <Badge variant="secondary" className="text-[10px] bg-emerald-100 text-emerald-700">best</Badge>}
                        <span className="text-sm">{day}</span>
                      </div>
                      <div className="flex items-center gap-4 text-right">
                        <div>
                          <p className="text-sm font-mono">{stats.sent}</p>
                          <p className="text-[10px] text-muted-foreground">sent</p>
                        </div>
                        <div>
                          <p className="text-sm font-mono text-emerald-600">{rr}%</p>
                          <p className="text-[10px] text-muted-foreground">reply</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
