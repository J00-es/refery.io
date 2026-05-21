'use client'

import { formatDistanceToNow } from 'date-fns'
import { ArrowLeft, ArrowRight, Mail, Linkedin, Phone, MessageSquare, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import type { OutreachMessage, OutreachRecipient } from '@/lib/outreach-types'

interface OutreachActivityFeedProps {
  messages: (OutreachMessage & { recipient: OutreachRecipient & { company: { id: string; name: string } | null } })[]
}

function getChannelIcon(channel: string) {
  switch (channel) {
    case 'email': return <Mail className="h-3.5 w-3.5" />
    case 'linkedin_connection':
    case 'linkedin_dm': return <Linkedin className="h-3.5 w-3.5" />
    case 'phone': return <Phone className="h-3.5 w-3.5" />
    default: return <MessageSquare className="h-3.5 w-3.5" />
  }
}

function truncateBody(body: string | null, length = 80): string {
  if (!body) return ''
  const cleaned = body.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
  if (cleaned.length <= length) return cleaned
  return cleaned.slice(0, length).trim() + '...'
}

export function OutreachActivityFeed({ messages }: OutreachActivityFeedProps) {
  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Mail className="h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">No messages yet.</p>
        <Link 
          href="/outreach/compose" 
          className="text-sm text-primary hover:underline mt-2"
        >
          Send your first cold email
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-0.5 -mx-2">
      {messages.map((message) => {
        const isInbound = message.direction === 'inbound'
        const activityAt = message.activity_at ?? message.sent_at
        const timeAgo = activityAt
          ? formatDistanceToNow(new Date(activityAt), { addSuffix: false })
          : 'Unknown'

        return (
          <Link
            key={message.id}
            href={`/outreach/threads/${message.thread_id}`}
            className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors group"
          >
            {/* Direction indicator */}
            <div className={`flex items-center justify-center w-6 h-6 rounded-full shrink-0 ${
              isInbound 
                ? 'bg-emerald-100 text-emerald-600' 
                : 'bg-stone-100 text-stone-600'
            }`}>
              {isInbound ? <ArrowLeft className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
            </div>

            {/* Channel icon */}
            <div className="text-muted-foreground shrink-0">
              {getChannelIcon(message.channel)}
            </div>

            {/* Recipient and body */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-sm">
                <span className="font-medium truncate">
                  {message.recipient?.name || 'Unknown'}
                </span>
                <span className="text-muted-foreground shrink-0">→</span>
                <span className="text-muted-foreground truncate">
                  {message.recipient?.company?.name || 'No company'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {truncateBody(message.body)}
              </p>
            </div>

            {/* Timestamp */}
            <span className="text-xs text-muted-foreground font-mono shrink-0">
              {timeAgo}
            </span>

            {/* Hover chevron */}
            <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </Link>
        )
      })}
    </div>
  )
}
