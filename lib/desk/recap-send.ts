/**
 * The recap draft, worked from Slack.
 *
 * The card in #refery-calls (lib/call-recap.ts) shows the draft in full. This
 * file gives it three verbs:
 *
 *   :outbox_tray: on the card   sends the Gmail draft as it stands
 *   "edit: <new text>"          replaces the body, in Gmail and on the card
 *   "redo: <what to change>"    has the model rewrite it to that instruction
 *
 * The send is drafts.send, not messages.send: what goes out is the draft in
 * Lily's mailbox, so an edit she made in Gmail is honoured, and the call works
 * on the gmail.compose scope alone. Every state change lands on call_recaps,
 * and the send claims the row (draft -> sending) before touching Gmail so a
 * retried Slack delivery cannot send twice.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { esc, getMessage, postThreadReply, updateMessage, type SlackBlock } from '@/lib/slack-bot'
import { createDraft, findThread, sendDraft, updateDraft } from '@/lib/google'
import { DRAFT_HEADER, loadSkill, quoteDraft, type Recap } from '@/lib/call-recap'
import { structured } from '@/lib/desk/model'
import { logActivity } from '@/lib/desk/outbound'
import { firstNameOf } from '@/lib/desk/people'

interface RecapRow {
  id: string
  entity_type: string
  entity_id: string | null
  person_name: string | null
  person_email: string | null
  summary: Recap | null
  gmail_draft_id: string | null
  gmail_thread_id: string | null
  email_subject: string | null
  email_body: string | null
  email_status: 'draft' | 'sending' | 'sent' | 'failed'
  email_sent_at: string | null
}

const COLUMNS = 'id, entity_type, entity_id, person_name, person_email, summary, gmail_draft_id, gmail_thread_id, email_subject, email_body, email_status, email_sent_at'

async function loadRecap(admin: SupabaseClient, channel: string, ts: string): Promise<RecapRow | null> {
  const { data } = await admin.from('call_recaps').select(COLUMNS).eq('slack_channel_id', channel).eq('slack_message_ts', ts).maybeSingle()
  return (data as RecapRow | null) ?? null
}

/**
 * Change one or two lines on the card without rebuilding it. The card holds
 * facts the row does not (meeting length, transcript link), so it is read
 * back and patched. A failed read is not fatal: the thread reply says what
 * happened either way, the card just keeps its old heading.
 */
async function patchCard(channel: string, ts: string, edit: (blocks: SlackBlock[]) => SlackBlock[]): Promise<void> {
  const m = await getMessage(channel, ts)
  if (!m?.blocks?.length) return
  await updateMessage(channel, ts, m.text ?? '', edit(m.blocks))
}

function isDraftSection(b: SlackBlock): boolean {
  const text = (b.text as { text?: string } | undefined)?.text ?? ''
  return b.type === 'section' && text.startsWith(DRAFT_HEADER.replace(/\*$/, ''))
}

function isHelpContext(b: SlackBlock): boolean {
  const els = (b.elements as { text?: string }[] | undefined) ?? []
  return b.type === 'context' && els.some(e => (e.text ?? '').includes(':outbox_tray:'))
}

/** :outbox_tray: on the card. */
export async function sendRecapFromSlack(admin: SupabaseClient, input: { channel: string; ts: string; slackUser: string }): Promise<boolean> {
  const recap = await loadRecap(admin, input.channel, input.ts)
  if (!recap) return false
  const reply = (text: string) => postThreadReply(input.channel, input.ts, text)

  if (recap.email_status === 'sent') {
    await reply(`Already sent${recap.email_sent_at ? ` on <!date^${Math.floor(new Date(recap.email_sent_at).getTime() / 1000)}^{date_short_pretty} at {time}|${recap.email_sent_at}>` : ''}. Nothing went out twice.`)
    return true
  }
  if (recap.email_status === 'sending') return true
  if (!recap.gmail_draft_id) {
    await reply(':warning: There is no Gmail draft for this call, so there is nothing to send. Reply "edit: <the email>" here to write one, then react again.')
    return true
  }

  // The claim. Two deliveries of the same reaction both reach here; only one
  // gets a row back.
  const { data: claimed } = await admin
    .from('call_recaps')
    .update({ email_status: 'sending' })
    .eq('id', recap.id)
    .in('email_status', ['draft', 'failed'])
    .select('id')
  if (!claimed?.length) return true

  const sent = await sendDraft(recap.gmail_draft_id)
  if (sent.error) {
    await admin.from('call_recaps').update({ email_status: 'failed', email_error: sent.error }).eq('id', recap.id)
    await reply(`:warning: Did not send: ${esc(sent.error)}`)
    return true
  }

  const now = new Date().toISOString()
  await admin
    .from('call_recaps')
    .update({
      email_status: 'sent',
      email_sent_at: now,
      email_sent_by: input.slackUser,
      gmail_message_id: sent.messageId ?? null,
      gmail_thread_id: sent.threadId ?? recap.gmail_thread_id,
      email_error: null,
    })
    .eq('id', recap.id)

  // On a candidate the send is part of their record, next to the desk's own
  // emails. Scouts and recruiters have no such log; the recap row is theirs.
  if (recap.entity_type === 'candidate' && recap.entity_id) {
    await admin.from('candidate_emails').insert({
      candidate_id: recap.entity_id,
      kind: 'call_recap',
      to_email: (recap.person_email ?? '').toLowerCase(),
      subject: recap.email_subject ?? '',
      body: recap.email_body ?? '',
      gmail_thread_id: sent.threadId ?? recap.gmail_thread_id,
      sent_by: input.slackUser,
      sent_at: now,
      meta: { via: 'slack', call_recap_id: recap.id, gmail_message_id: sent.messageId ?? null },
    }).then(() => undefined, () => undefined)
    await logActivity(admin, recap.entity_id, 'email_sent', `Recap email sent after the call.`, { metadata: { via: 'slack', by: input.slackUser, call_recap_id: recap.id } })
  }

  await patchCard(input.channel, input.ts, blocks =>
    blocks.map(b => {
      if (isDraftSection(b)) {
        const text = (b.text as { text: string }).text
        const body = text.slice(text.indexOf('\n') + 1)
        return { ...b, text: { type: 'mrkdwn', text: `*Sent to ${esc(recap.person_email ?? '')}*\n${body}` } }
      }
      if (isHelpContext(b)) {
        return { ...b, elements: [{ type: 'mrkdwn', text: `:white_check_mark: sent by <@${input.slackUser}>   ·   reply in thread to save a note` }] }
      }
      return b
    }),
  )
  await reply(`:white_check_mark: <@${input.slackUser}> sent the recap to ${esc(recap.person_email ?? 'them')}. What went out is the Gmail draft as it stood, edits made there included.`)
  return true
}

/**
 * "edit: …" or "redo: …" in the card's thread. Returns false when the message
 * is neither, so the caller can treat the reply as a note.
 */
export async function changeRecapFromSlack(admin: SupabaseClient, input: { text: string; channel: string; threadTs: string; slackUser: string }): Promise<boolean> {
  const m = input.text.trim().match(/^(edit|redo)\s*[:：]\s*([\s\S]+)$/i)
  if (!m) return false
  const verb = m[1].toLowerCase() as 'edit' | 'redo'
  const arg = m[2].trim()

  const recap = await loadRecap(admin, input.channel, input.threadTs)
  if (!recap) return false
  const reply = (text: string) => postThreadReply(input.channel, input.threadTs, text)

  if (recap.email_status === 'sent') {
    await reply('That recap has already been sent, so there is nothing left to change here.')
    return true
  }
  if (!recap.person_email) {
    await reply(':warning: No email address is known for this person, so a draft cannot be kept for them.')
    return true
  }

  let body: string
  if (verb === 'edit') {
    body = arg
  } else {
    if (!recap.email_body) {
      await reply(':warning: There is no draft to rewrite. Reply "edit: <the email>" to write one.')
      return true
    }
    try {
      body = await rewrite(recap, arg)
    } catch (err) {
      await reply(`:warning: Could not rewrite the draft: ${esc(err instanceof Error ? err.message : String(err))}`)
      return true
    }
  }

  // Gmail first, so the card never claims a draft Gmail does not hold. The
  // thread lookup is repeated rather than stored: the row keeps the thread id
  // but not the Message-ID the reply headers need.
  const thread = await findThread(recap.person_email)
  const draftInput = { to: recap.person_email, toName: recap.person_name, subject: recap.email_subject ?? recap.summary?.emailSubject ?? '', body, thread }
  let gmail = recap.gmail_draft_id ? await updateDraft(recap.gmail_draft_id, draftInput) : await createDraft(draftInput)
  if (gmail.error && recap.gmail_draft_id) {
    // The draft went missing in Gmail (sent or deleted by hand). A new one
    // keeps the card usable.
    gmail = await createDraft(draftInput)
  }

  await admin
    .from('call_recaps')
    .update({
      email_body: body,
      email_edited_at: new Date().toISOString(),
      ...(gmail.error
        ? { email_error: gmail.error }
        : { gmail_draft_id: gmail.draftId ?? recap.gmail_draft_id, gmail_thread_id: gmail.threadId ?? recap.gmail_thread_id, email_subject: gmail.subject, email_error: null, email_status: 'draft' }),
    })
    .eq('id', recap.id)

  await patchCard(input.channel, input.threadTs, blocks =>
    blocks.map(b => (isDraftSection(b) ? { ...b, text: { type: 'mrkdwn', text: `${DRAFT_HEADER.replace(/\*$/, '')} · ${verb === 'edit' ? 'edited' : 'rewritten'} from Slack*\n${quoteDraft(body)}` } } : b)),
  )

  const first = firstNameOf(recap.person_name)
  if (gmail.error) {
    await reply(`:pencil2: The card now carries this version, but Gmail did not take it (${esc(gmail.error)}), so :outbox_tray: would still send the old draft. Fix the draft in Gmail or try again.\n${quoteDraft(body)}`)
  } else {
    await reply(`:pencil2: ${verb === 'edit' ? 'Replaced' : 'Rewritten'}. The Gmail draft to ${first} now reads as below; :outbox_tray: on the card sends it.\n${quoteDraft(body)}`)
  }
  return true
}

const RewriteSchema = z.object({
  body: z.string().describe('The complete rewritten plain-text email, ready to send. Starts "Hi <first name>," and ends with the same sign-off as the current draft. No markdown, no placeholders, no square-bracket blanks.'),
})

/** The model applies one instruction to the current draft, in the skill's voice. */
async function rewrite(recap: RecapRow, instruction: string): Promise<string> {
  const system = [
    'You are revising a follow-up email Lily Joo of Refery is about to send after a call. Apply the instruction to the current draft and return the whole email.',
    'Change only what the instruction asks for and whatever it forces; keep every other sentence as it is. Never add a fact, a number or a commercial term that is not already in the draft or the notes below.',
    'Plain text. No em dash. No placeholders.',
    '',
    'The house style the draft was written to:',
    loadSkill(),
  ].join('\n')
  const s = recap.summary
  const user = [
    `PERSON: ${recap.person_name ?? 'unknown'} (${recap.entity_type}).`,
    s?.worthKnowing?.length ? `NOTES FROM THE CALL:\n${s.worthKnowing.map(w => `- ${w}`).join('\n')}` : '',
    `CURRENT DRAFT:\n${recap.email_body}`,
    `INSTRUCTION FROM LILY: ${instruction}`,
  ]
    .filter(Boolean)
    .join('\n\n')
  const call = await structured('draft', { system, user, schema: RewriteSchema, maxOutputTokens: 2500 })
  const body = call.output.body.trim()
  if (body.length < 40) throw new Error('the rewrite came back empty')
  return body
}
