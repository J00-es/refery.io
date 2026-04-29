import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import Link from 'next/link'
import { formatDistanceToNow, subDays, format, differenceInHours } from 'date-fns'
import { 
  Send, 
  MessageSquare, 
  Calendar, 
  TrendingUp, 
  ArrowRight, 
  ArrowLeft, 
  Mail, 
  Linkedin, 
  Phone, 
  Clock,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Sparkles
} from 'lucide-react'
import { PERSONA_CONFIG, STATUS_CONFIG, CHANNEL_CONFIG, type OutreachFollowup, type OutreachThread, type OutreachMessage, type OutreachRecipient } from '@/lib/outreach-types'
import { OutreachKPICards } from './outreach-kpi-cards'
import { OutreachActivityFeed } from './outreach-activity-feed'

const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']

function getChannelIcon(channel: string) {
  switch (channel) {
    case 'email': return <Mail className="h-3.5 w-3.5" />
    case 'linkedin_connection':
    case 'linkedin_dm': return <Linkedin className="h-3.5 w-3.5" />
    case 'phone': return <Phone className="h-3.5 w-3.5" />
    default: return <MessageSquare className="h-3.5 w-3.5" />
  }
}

export default async function OutreachHubPage() {
  await cookies()
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/login')
  }

  // Check if super admin
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(user.email || '')

  // Get user role
  const { data: adminData } = await adminClient
    .from('users_admin')
    .select('role')
    .eq('email', user.email)
    .single()

  const userRole = isSuperAdmin ? 'super_admin' : adminData?.role || 'viewer'
  const isAdmin = ['super_admin', 'admin'].includes(userRole)

  // Redirect non-admins
  if (!isAdmin) {
    redirect('/dashboard')
  }

  const now = new Date()
  const sevenDaysAgo = subDays(now, 7)
  const thirtyDaysAgo = subDays(now, 30)
  const sixtyDaysAgo = subDays(now, 60)

  // Fetch all data in parallel
  const [
    touchesResult,
    priorTouchesResult,
    repliesResult,
    priorRepliesResult,
    meetingsResult,
    activeThreadsResult,
    followupsResult,
    staleThreadsResult,
    recentMessagesResult,
    sparklineResult
  ] = await Promise.all([
    // Touches last 7 days
    adminClient
      .from('outreach_messages')
      .select('id, channel, direction')
      .eq('direction', 'outbound')
      .gte('sent_at', sevenDaysAgo.toISOString()),
    // Prior 7 days for comparison
    adminClient
      .from('outreach_messages')
      .select('id')
      .eq('direction', 'outbound')
      .gte('sent_at', subDays(sevenDaysAgo, 7).toISOString())
      .lt('sent_at', sevenDaysAgo.toISOString()),
    // Replies last 30 days
    adminClient
      .from('outreach_messages')
      .select('id')
      .eq('direction', 'inbound')
      .gte('sent_at', thirtyDaysAgo.toISOString()),
    // Prior 30 days replies
    adminClient
      .from('outreach_messages')
      .select('id')
      .eq('direction', 'inbound')
      .gte('sent_at', sixtyDaysAgo.toISOString())
      .lt('sent_at', thirtyDaysAgo.toISOString()),
    // Meetings this month
    adminClient
      .from('outreach_threads')
      .select('id')
      .not('meeting_booked_at', 'is', null)
      .gte('meeting_booked_at', new Date(now.getFullYear(), now.getMonth(), 1).toISOString()),
    // Active threads
    adminClient
      .from('outreach_threads')
      .select('id')
      .in('status', ['active', 'awaiting_reply']),
    // Followups due in next 24 hours
    adminClient
      .from('outreach_followups')
      .select(`
        *,
        recipient:outreach_recipients(id, name, persona, current_company_id, company:companies(id, name)),
        thread:outreach_threads(id, subject, status)
      `)
      .eq('status', 'pending')
      .lte('due_at', new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString())
      .order('due_at', { ascending: true })
      .limit(10),
    // Stale threads (5+ days no reply)
    adminClient
      .from('outreach_threads')
      .select(`
        *,
        recipient:outreach_recipients(id, name, persona, current_company_id, company:companies(id, name))
      `)
      .in('status', ['active', 'awaiting_reply', 'no_response_following_up'])
      .lt('last_touch_at', subDays(now, 5).toISOString())
      .is('first_reply_at', null)
      .order('last_touch_at', { ascending: true })
      .limit(10),
    // Recent messages for activity feed
    adminClient
      .from('outreach_messages')
      .select(`
        id,
        direction,
        channel,
        subject,
        body,
        sent_at,
        recipient:outreach_recipients(id, name, company:companies(id, name))
      `)
      .order('sent_at', { ascending: false })
      .limit(20),
    // Sparkline data (last 14 days daily)
    adminClient
      .from('outreach_messages')
      .select('sent_at, direction')
      .eq('direction', 'outbound')
      .gte('sent_at', subDays(now, 14).toISOString())
  ])

  const touches = touchesResult.data || []
  const priorTouches = priorTouchesResult.data || []
  const replies = repliesResult.data || []
  const priorReplies = priorRepliesResult.data || []
  const meetings = meetingsResult.data || []
  const activeThreads = activeThreadsResult.data || []
  const followups = (followupsResult.data || []) as (OutreachFollowup & { recipient: OutreachRecipient & { company: { id: string; name: string } | null }; thread: OutreachThread })[]
  const staleThreads = (staleThreadsResult.data || []) as (OutreachThread & { recipient: OutreachRecipient & { company: { id: string; name: string } | null } })[]
  const recentMessages = (recentMessagesResult.data || []) as (OutreachMessage & { recipient: OutreachRecipient & { company: { id: string; name: string } | null } })[]
  const sparklineData = sparklineResult.data || []

  // Calculate channel breakdown
  const channelBreakdown = touches.reduce((acc, t) => {
    acc[t.channel] = (acc[t.channel] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Calculate sparkline (daily counts for last 14 days)
  const dailyCounts: number[] = []
  for (let i = 13; i >= 0; i--) {
    const day = subDays(now, i)
    const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate())
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
    const count = sparklineData.filter(m => {
      const sentAt = new Date(m.sent_at)
      return sentAt >= dayStart && sentAt < dayEnd
    }).length
    dailyCounts.push(count)
  }

  // Calculate reply rate
  const outboundLast30 = touches.length + priorTouches.length // rough estimate
  const replyRate = outboundLast30 > 0 ? Math.round((replies.length / outboundLast30) * 100) : 0
  const priorOutbound = priorTouches.length * 2 // rough estimate
  const priorReplyRate = priorOutbound > 0 ? Math.round((priorReplies.length / priorOutbound) * 100) : 0
  const replyRateChange = replyRate - priorReplyRate

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Outreach Hub</h1>
          <p className="text-sm text-muted-foreground">Track every touch, see what works, take action fast.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/outreach/insights">
              <TrendingUp className="h-4 w-4 mr-2" />
              Insights
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/outreach/compose">
              <Send className="h-4 w-4 mr-2" />
              Compose
            </Link>
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <OutreachKPICards
        touches={touches.length}
        touchesChange={touches.length - priorTouches.length}
        channelBreakdown={channelBreakdown}
        sparkline={dailyCounts}
        replyRate={replyRate}
        replyRateChange={replyRateChange}
        meetingsBooked={meetings.length}
        activeThreads={activeThreads.length}
      />

      {/* Middle Row: Two Columns */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Today's Actions */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-medium">Today&apos;s Actions</CardTitle>
              <Badge variant="secondary" className="font-mono text-xs">
                {followups.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {followups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-500 mb-2" />
                <p className="text-sm text-muted-foreground">You&apos;re all caught up. Nice.</p>
              </div>
            ) : (
              <ScrollArea className="h-[280px] -mx-2">
                <div className="space-y-1 px-2">
                  {followups.map((followup) => {
                    const isOverdue = new Date(followup.due_at) < now
                    const hoursUntil = differenceInHours(new Date(followup.due_at), now)
                    const persona = followup.recipient?.persona
                    const personaConfig = persona ? PERSONA_CONFIG[persona] : null
                    
                    return (
                      <Link
                        key={followup.id}
                        href={`/outreach/threads/${followup.thread_id}`}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors group"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate">
                              {followup.recipient?.name || 'Unknown'}
                            </span>
                            {personaConfig && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${personaConfig.bgColor} ${personaConfig.color} lowercase`}>
                                {personaConfig.label}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {followup.recipient?.company?.name || 'No company'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-muted-foreground">
                            {getChannelIcon(followup.action_type.includes('email') ? 'email' : followup.action_type.includes('linkedin') ? 'linkedin_dm' : 'other')}
                          </div>
                          <span className={`text-xs font-mono ${isOverdue ? 'text-red-600' : 'text-muted-foreground'}`}>
                            {isOverdue ? `overdue ${Math.abs(hoursUntil)}h` : `in ${hoursUntil}h`}
                          </span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Needs Attention */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                Needs Attention
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              </CardTitle>
              <Badge variant="secondary" className="font-mono text-xs">
                {staleThreads.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {staleThreads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Sparkles className="h-8 w-8 text-emerald-500 mb-2" />
                <p className="text-sm text-muted-foreground">No stale threads. Keep it up!</p>
              </div>
            ) : (
              <ScrollArea className="h-[280px] -mx-2">
                <div className="space-y-1 px-2">
                  {staleThreads.map((thread) => {
                    const daysSince = Math.floor((now.getTime() - new Date(thread.last_touch_at || thread.created_at).getTime()) / (1000 * 60 * 60 * 24))
                    const persona = thread.recipient?.persona
                    const personaConfig = persona ? PERSONA_CONFIG[persona] : null
                    
                    return (
                      <div
                        key={thread.id}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors group"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Link 
                              href={`/outreach/threads/${thread.id}`}
                              className="font-medium text-sm truncate hover:underline"
                            >
                              {thread.recipient?.name || 'Unknown'}
                            </Link>
                            {personaConfig && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${personaConfig.bgColor} ${personaConfig.color} lowercase`}>
                                {personaConfig.label}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {thread.recipient?.company?.name || 'No company'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className={`text-xs font-mono ${daysSince > 7 ? 'border-red-200 text-red-600' : 'border-amber-200 text-amber-600'}`}>
                            {daysSince}d no reply
                          </Badge>
                          <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                            <Link href={`/outreach/compose?thread=${thread.id}`}>
                              Follow up
                            </Link>
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity Feed */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium">Recent Activity</CardTitle>
            <Button variant="ghost" size="sm" className="text-xs" asChild>
              <Link href="/outreach/threads">
                View all threads
                <ChevronRight className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <OutreachActivityFeed messages={recentMessages} />
        </CardContent>
      </Card>
    </div>
  )
}
