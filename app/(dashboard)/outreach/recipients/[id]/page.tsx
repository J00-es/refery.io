import { createClient, createAdminClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { format, formatDistanceToNow } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  ArrowLeft,
  Mail,
  Linkedin,
  Phone,
  MapPin,
  Building2,
  AlertTriangle,
  Send,
  ExternalLink,
  ChevronRight,
  Copy,
  Edit,
  MoreHorizontal,
  MessageSquare
} from 'lucide-react'
import {
  PERSONA_CONFIG,
  STATUS_CONFIG,
  type OutreachRecipient,
  type OutreachThread
} from '@/lib/outreach-types'

const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']

export default async function RecipientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()

  // Fetch recipient with company
  const { data: recipient, error } = await adminClient
    .from('outreach_recipients')
    .select(`
      *,
      company:companies(id, name, stage, website, linkedin_url)
    `)
    .eq('id', id)
    .single()

  if (error || !recipient) {
    notFound()
  }

  // Fetch threads for this recipient
  const { data: threads } = await adminClient
    .from('outreach_threads')
    .select('*')
    .eq('recipient_id', id)
    .order('last_touch_at', { ascending: false })

  const typedRecipient = recipient as OutreachRecipient & {
    company: { id: string; name: string; stage?: string; website?: string; linkedin_url?: string } | null
  }
  const typedThreads = (threads || []) as OutreachThread[]

  const personaConfig = typedRecipient.persona ? PERSONA_CONFIG[typedRecipient.persona] : null
  const replyRate = typedRecipient.lifetime_touches > 0
    ? Math.round((typedRecipient.lifetime_replies / typedRecipient.lifetime_touches) * 100)
    : 0

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/outreach/recipients">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to recipients
          </Link>
        </Button>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className={`flex items-center justify-center w-20 h-20 rounded-full ${personaConfig?.bgColor || 'bg-stone-100'} ${personaConfig?.color || 'text-stone-700'} text-2xl font-semibold`}>
            {typedRecipient.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
          </div>

          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold">{typedRecipient.name}</h1>
              {typedRecipient.do_not_contact && (
                <Badge variant="destructive" className="text-xs">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Do Not Contact
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">{typedRecipient.current_title || 'No title'}</p>
            {typedRecipient.company && (
              <Link
                href={`/companies/${typedRecipient.company.id}`}
                className="text-primary hover:underline text-sm"
              >
                {typedRecipient.company.name}
              </Link>
            )}

            <div className="flex items-center gap-2 mt-2">
              {personaConfig && (
                <span className={`text-xs px-2 py-1 rounded-full ${personaConfig.bgColor} ${personaConfig.color}`}>
                  {personaConfig.label}
                </span>
              )}
              {typedRecipient.seniority && (
                <span className="text-xs px-2 py-1 rounded-full bg-stone-100 text-stone-600">
                  {typedRecipient.seniority.replace('_', ' ')}
                </span>
              )}
              {typedRecipient.location && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {typedRecipient.location}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
          <Button size="sm" asChild>
            <Link href={`/outreach/compose?recipient=${typedRecipient.id}`}>
              <Send className="h-4 w-4 mr-2" />
              Start Thread
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column - Contact info */}
        <div className="space-y-6">
          {/* Contact Methods */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Contact Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {typedRecipient.email && (
                <div className="flex items-center gap-2 group">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm flex-1 truncate">{typedRecipient.email}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100">
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              )}
              {typedRecipient.linkedin_url && (
                <div className="flex items-center gap-2 group">
                  <Linkedin className="h-4 w-4 text-muted-foreground" />
                  <a
                    href={typedRecipient.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline flex-1"
                  >
                    LinkedIn Profile
                  </a>
                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </div>
              )}
              {typedRecipient.preferred_channel && (
                <div className="text-xs text-muted-foreground pt-2">
                  Preferred channel: {typedRecipient.preferred_channel.replace('_', ' ')}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Stats */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Engagement Stats</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Lifetime Touches</p>
                  <p className="text-2xl font-mono font-semibold">{typedRecipient.lifetime_touches}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Replies</p>
                  <p className="text-2xl font-mono font-semibold">{typedRecipient.lifetime_replies}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Reply Rate</p>
                  <p className="text-2xl font-mono font-semibold">{replyRate}%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Threads</p>
                  <p className="text-2xl font-mono font-semibold">{typedThreads.length}</p>
                </div>
              </div>

              <Separator className="my-4" />

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">First contacted</span>
                  <span>
                    {typedRecipient.first_contacted_at
                      ? format(new Date(typedRecipient.first_contacted_at), 'MMM d, yyyy')
                      : 'Never'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last contacted</span>
                  <span>
                    {typedRecipient.last_contacted_at
                      ? formatDistanceToNow(new Date(typedRecipient.last_contacted_at), { addSuffix: true })
                      : 'Never'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last replied</span>
                  <span>
                    {typedRecipient.last_replied_at
                      ? formatDistanceToNow(new Date(typedRecipient.last_replied_at), { addSuffix: true })
                      : 'Never'}
                  </span>
                </div>
              </div>

              {typedRecipient.cooldown_until && new Date(typedRecipient.cooldown_until) > new Date() && (
                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-700">
                    Cooldown until {format(new Date(typedRecipient.cooldown_until), 'MMM d, yyyy')}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Source */}
          {(typedRecipient.inbound_source || typedRecipient.mutual_connection_name) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Source</CardTitle>
              </CardHeader>
              <CardContent>
                {typedRecipient.inbound_source && (
                  <p className="text-sm">{typedRecipient.inbound_source}</p>
                )}
                {typedRecipient.mutual_connection_name && (
                  <p className="text-sm text-muted-foreground mt-1">
                    via {typedRecipient.mutual_connection_name}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Tags */}
          {typedRecipient.tags && typedRecipient.tags.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Tags</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1">
                  {typedRecipient.tags.map(tag => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column - Threads */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Conversation History</CardTitle>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/outreach/compose?recipient=${typedRecipient.id}`}>
                    <Send className="h-4 w-4 mr-2" />
                    New Thread
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {typedThreads.length === 0 ? (
                <div className="text-center py-12">
                  <MessageSquare className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No threads yet.</p>
                  <Button size="sm" className="mt-4" asChild>
                    <Link href={`/outreach/compose?recipient=${typedRecipient.id}`}>
                      Start your first conversation
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {typedThreads.map(thread => {
                    const statusConfig = STATUS_CONFIG[thread.status]
                    return (
                      <Link
                        key={thread.id}
                        href={`/outreach/threads/${thread.id}`}
                        className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {thread.subject || 'No subject'}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusConfig.bgColor} ${statusConfig.color}`}>
                              {statusConfig.label}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {thread.total_touches} touches
                            </span>
                            {thread.first_reply_at && (
                              <span className="text-xs text-emerald-600">replied</span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-muted-foreground">
                            {thread.last_touch_at
                              ? formatDistanceToNow(new Date(thread.last_touch_at), { addSuffix: true })
                              : 'No activity'}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </Link>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notes */}
          <Card className="mt-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              {typedRecipient.notes ? (
                <p className="text-sm whitespace-pre-wrap">{typedRecipient.notes}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No notes yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
