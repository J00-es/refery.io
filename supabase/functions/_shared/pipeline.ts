import type { SupabaseClient } from "npm:@supabase/supabase-js@2.95.0";
import { chooseDraftModel, extractAddress, extractDisplayName, extractDomain } from "./domain.ts";
import { gatherContext } from "./context.ts";
import { classifyEmail, draftReply } from "./openai.ts";
import { postApproval, postSlackMessage, replaceApprovalWithStatus } from "./slack.ts";
import { sendReply } from "./gmail.ts";
import type { BrainSettings, IncomingEmail, StoredDraft } from "./types.ts";

async function settings(db: SupabaseClient): Promise<BrainSettings> {
  const { data, error } = await db.from("brain_settings").select("*").eq("id", 1).single();
  if (error) throw new Error(`Settings unavailable: ${error.message}`);
  return {
    ...data,
    monthly_budget_usd: Number(data.monthly_budget_usd),
  } as BrainSettings;
}

async function markEvent(db: SupabaseClient, eventId: string, status: string, error?: string | null) {
  await db.from("brain_events").update({
    status,
    error: error ?? null,
    processed_at: ["completed", "ignored", "failed", "budget_blocked"].includes(status) ? new Date().toISOString() : null,
  }).eq("id", eventId);
}

async function getOrCreateEvent(db: SupabaseClient, email: IncomingEmail): Promise<{ id: string; duplicate: boolean; status: string }> {
  const { data: existing } = await db.from("brain_events")
    .select("id,status")
    .eq("provider", email.fixture ? "test" : "gmail")
    .eq("external_id", email.externalMessageId)
    .eq("event_type", "email_received")
    .maybeSingle();
  if (existing && ["processing", "ignored", "awaiting_approval", "completed"].includes(existing.status)) {
    return { id: existing.id, duplicate: true, status: existing.status };
  }
  if (existing) {
    await db.from("brain_events").update({ status: "received", error: null, attempts: 0, payload: email }).eq("id", existing.id);
    return { id: existing.id, duplicate: false, status: "received" };
  }
  const { data, error } = await db.from("brain_events").insert({
    provider: email.fixture ? "test" : "gmail",
    external_id: email.externalMessageId,
    event_type: "email_received",
    payload: email,
  }).select("id,status").single();
  if (error?.code === "23505") {
    const raced = await db.from("brain_events").select("id,status")
      .eq("provider", email.fixture ? "test" : "gmail")
      .eq("external_id", email.externalMessageId)
      .eq("event_type", "email_received")
      .single();
    if (raced.error) throw new Error(`Event race recovery failed: ${raced.error.message}`);
    return { id: raced.data.id, duplicate: true, status: raced.data.status };
  }
  if (error) throw new Error(`Event insert failed: ${error.message}`);
  return { id: data.id, duplicate: false, status: data.status };
}

async function upsertSender(db: SupabaseClient, email: IncomingEmail): Promise<string | null> {
  const address = extractAddress(email.from);
  if (!address.includes("@")) return null;
  const { data: existing } = await db.from("brain_people").select("id").ilike("email", address).maybeSingle();
  if (existing) {
    await db.from("brain_people").update({
      full_name: extractDisplayName(email.from),
      last_seen_at: email.receivedAt,
    }).eq("id", existing.id);
    return existing.id;
  }
  const { data, error } = await db.from("brain_people").insert({
    email: address,
    full_name: extractDisplayName(email.from),
    first_seen_at: email.receivedAt,
    last_seen_at: email.receivedAt,
    metadata: { source: email.fixture ? "test" : "gmail" },
  }).select("id").single();
  if (error?.code === "23505") {
    const raced = await db.from("brain_people").select("id").ilike("email", address).single();
    if (!raced.error) return raced.data.id;
  }
  if (error) throw new Error(`Sender upsert failed: ${error.message}`);
  return data.id;
}

async function upsertCompany(db: SupabaseClient, email: IncomingEmail): Promise<string | null> {
  const domain = extractDomain(email.from);
  if (!domain) return null;
  const { data: existing } = await db.from("brain_companies").select("id").ilike("domain", domain).maybeSingle();
  if (existing) return existing.id;
  const fallbackName = domain.split(".")[0].replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const { data, error } = await db.from("brain_companies").insert({
    name: fallbackName,
    domain,
    website: `https://${domain}`,
    metadata: { inferred_from_email: true },
  }).select("id").single();
  if (error?.code === "23505") {
    const raced = await db.from("brain_companies").select("id").ilike("domain", domain).single();
    if (!raced.error) return raced.data.id;
  }
  if (error) throw new Error(`Company upsert failed: ${error.message}`);
  return data.id;
}

async function createConversationAndMessage(db: SupabaseClient, email: IncomingEmail, personId: string | null, companyId: string | null) {
  const provider = email.fixture ? "test" : "gmail";
  const { data: conversation, error: conversationError } = await db.from("brain_conversations").upsert({
    provider,
    external_thread_id: email.externalThreadId,
    subject: email.subject,
    person_id: personId,
    company_id: companyId,
    latest_message_at: email.receivedAt,
  }, { onConflict: "provider,external_thread_id" }).select("id").single();
  if (conversationError) throw new Error(`Conversation upsert failed: ${conversationError.message}`);

  const { data: message, error: messageError } = await db.from("brain_messages").upsert({
    conversation_id: conversation.id,
    provider,
    external_message_id: email.externalMessageId,
    direction: "inbound",
    sender: email.from,
    recipients: { to: email.to, cc: email.cc },
    subject: email.subject,
    body_text: email.body,
    occurred_at: email.receivedAt,
    raw_payload: { incoming_email: email, headers: email.headers ?? {}, raw: email.raw ?? {} },
  }, { onConflict: "provider,external_message_id" }).select("id").single();
  if (messageError) throw new Error(`Message upsert failed: ${messageError.message}`);

  await db.from("brain_memory_sources").upsert({
    provider,
    external_id: email.externalMessageId,
    source_type: "email",
    title: email.subject,
    content: email.body,
    person_id: personId,
    company_id: companyId,
    conversation_id: conversation.id,
    occurred_at: email.receivedAt,
    metadata: { from: email.from, to: email.to, cc: email.cc },
  }, { onConflict: "provider,external_id" });

  return { conversationId: conversation.id, messageId: message.id };
}

async function createBudgetBlockedTask(db: SupabaseClient, email: IncomingEmail, eventId: string, reason: string) {
  await db.from("brain_tasks").insert({
    title: `Budget cap blocked draft: ${email.subject}`,
    description: `Review the inbound email from ${email.from}. ${reason}`,
    priority: "high",
    source: "refery-brain-budget-guardrail",
    metadata: { event_id: eventId, gmail_message_id: email.externalMessageId },
  });
}

export async function processIncomingEmail(args: {
  db: SupabaseClient;
  email: IncomingEmail;
  gmailThread?: Array<Record<string, unknown>>;
}): Promise<Record<string, unknown>> {
  const config = await settings(args.db);
  const event = await getOrCreateEvent(args.db, args.email);
  if (event.duplicate) return { ok: true, duplicate: true, event_id: event.id, status: event.status };

  await args.db.from("brain_events").update({ status: "processing", attempts: 1 }).eq("id", event.id);
  try {
    if (!args.email.fixture && !config.enabled) {
      await markEvent(args.db, event.id, "ignored", "Refery Brain kill switch is off");
      return { ok: true, event_id: event.id, status: "disabled" };
    }

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const { count } = await args.db.from("brain_events").select("id", { count: "exact", head: true })
      .eq("event_type", "email_received").gte("received_at", startOfDay.toISOString());
    if (!args.email.fixture && (count ?? 0) > config.max_daily_emails) {
      await markEvent(args.db, event.id, "ignored", "Daily email safety cap reached");
      return { ok: true, event_id: event.id, status: "daily_cap" };
    }

    if (extractAddress(args.email.from) === config.owner_email.toLowerCase()) {
      await markEvent(args.db, event.id, "ignored", "Outbound/self email ignored");
      return { ok: true, event_id: event.id, status: "self_ignored" };
    }

    const personId = await upsertSender(args.db, args.email);
    const companyId = await upsertCompany(args.db, args.email);
    const { conversationId, messageId } = await createConversationAndMessage(args.db, args.email, personId, companyId);
    const classified = await classifyEmail({ db: args.db, settings: config, email: args.email, eventId: event.id });

    if (!classified.classification.action_needed) {
      await args.db.from("brain_outcomes").insert({
        conversation_id: conversationId,
        outcome_type: "no_action_needed",
        details: { classification: classified.classification, source_message_id: messageId },
      });
      await markEvent(args.db, event.id, "ignored");
      return { ok: true, event_id: event.id, status: "no_action", classification: classified.classification };
    }

    // Test fixtures must never retrieve or forward production Gmail, Slack,
    // Granola, or structured-memory content. A live-model fixture exercises
    // the model integration using only the synthetic email supplied by the test.
    const context = args.email.fixture
      ? {
        gmail_thread: args.gmailThread ?? [],
        slack_messages: [],
        structured_records: {},
        retrieval_policy: { fixture_isolation: true, context_is_untrusted_data: true },
      }
      : await gatherContext({
        db: args.db,
        email: args.email,
        personId,
        companyId,
        gmailThread: args.gmailThread,
      });
    let model = chooseDraftModel(classified.classification, config);
    let drafted;
    try {
      drafted = await draftReply({
        db: args.db,
        settings: config,
        email: args.email,
        classification: classified.classification,
        context,
        model,
        eventId: event.id,
      });
    } catch (error) {
      if (model !== config.cheap_model && String(error).includes("MONTHLY_BUDGET_BLOCKED")) {
        model = config.cheap_model;
        drafted = await draftReply({
          db: args.db,
          settings: config,
          email: args.email,
          classification: classified.classification,
          context,
          model,
          eventId: event.id,
        });
      } else {
        throw error;
      }
    }

    const { data: draft, error: draftError } = await args.db.from("brain_drafts").insert({
      event_id: event.id,
      conversation_id: conversationId,
      source_message_id: messageId,
      status: "pending",
      action_type: classified.classification.action_type,
      priority: classified.classification.priority,
      classification: { ...classified.classification, classifier_model: classified.model },
      retrieved_context: context,
      current_body: drafted.draft.body,
      model: drafted.model,
    }).select("id").single();
    if (draftError) throw new Error(`Draft insert failed: ${draftError.message}`);

    await args.db.from("brain_draft_versions").insert({
      draft_id: draft.id,
      version: 1,
      body: drafted.draft.body,
      model: drafted.model,
      prompt_fingerprint: "refery-voice-v1",
    });
    await args.db.from("brain_retrievals").insert([
      { draft_id: draft.id, source_provider: "gmail", source_external_id: args.email.externalThreadId, excerpt: `${args.gmailThread?.length ?? 0} thread messages`, metadata: { count: args.gmailThread?.length ?? 0 } },
      { draft_id: draft.id, source_provider: "supabase", source_table: "structured_records", excerpt: "Refery companies, contacts, roles, candidates, facts, open loops, and Granola-backed transcripts", metadata: { present: true } },
      { draft_id: draft.id, source_provider: "google_drive", source_table: "brain_knowledge_chunks", excerpt: `${Array.isArray(context.company_knowledge) ? context.company_knowledge.length : 0} approved documentation chunks`, metadata: { count: Array.isArray(context.company_knowledge) ? context.company_knowledge.length : 0 } },
      { draft_id: draft.id, source_provider: "slack", source_table: "search.messages", excerpt: `${Array.isArray(context.slack_messages) ? context.slack_messages.length : 0} Slack messages`, metadata: { count: Array.isArray(context.slack_messages) ? context.slack_messages.length : 0 } },
    ]);

    const publishFixtureCard = args.email.fixture && args.email.publishSlackTest;
    if ((config.dry_run || args.email.fixture) && !publishFixtureCard) {
      await args.db.from("brain_approvals").insert({
        draft_id: draft.id,
        status: "pending",
        slack_channel_id: "dry-run",
        slack_message_ts: `dry-run:${draft.id}`,
        slack_thread_ts: `dry-run:${draft.id}`,
      });
    } else {
      if (!config.approval_channel_id) throw new Error("Missing approval_channel_id in brain_settings");
      const posted = await postApproval({
        channel: config.approval_channel_id,
        draftId: draft.id,
        from: args.email.from,
        subject: args.email.subject,
        reason: classified.classification.reason,
        body: drafted.draft.body,
        model: drafted.model,
        dryRun: config.dry_run || Boolean(args.email.fixture),
        version: 1,
      });
      await args.db.from("brain_approvals").insert({
        draft_id: draft.id,
        status: "pending",
        slack_channel_id: posted.channel,
        slack_message_ts: posted.ts,
        slack_thread_ts: posted.threadTs,
      });
    }

    await markEvent(args.db, event.id, "awaiting_approval");
    return {
      ok: true,
      event_id: event.id,
      draft_id: draft.id,
      status: "awaiting_approval",
      classification: classified.classification,
      model: drafted.model,
      dry_run: config.dry_run || Boolean(args.email.fixture),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("MONTHLY_BUDGET_BLOCKED")) {
      await createBudgetBlockedTask(args.db, args.email, event.id, message);
      await markEvent(args.db, event.id, "budget_blocked", message);
      return { ok: false, event_id: event.id, status: "budget_blocked" };
    }
    await markEvent(args.db, event.id, "failed", message);
    throw error;
  }
}

async function loadDraftBundle(db: SupabaseClient, draftId: string): Promise<{ draft: StoredDraft; email: IncomingEmail; settings: BrainSettings }> {
  const config = await settings(db);
  const { data: draft, error } = await db.from("brain_drafts").select("*").eq("id", draftId).single();
  if (error) throw new Error(`Draft not found: ${error.message}`);
  const { data: message, error: messageError } = await db.from("brain_messages").select("raw_payload").eq("id", draft.source_message_id).single();
  if (messageError) throw new Error(`Source email not found: ${messageError.message}`);
  const email = message.raw_payload?.incoming_email as IncomingEmail;
  if (!email?.externalThreadId) throw new Error("Stored source email is incomplete");
  return { draft: draft as StoredDraft, email, settings: config };
}

export async function approveSend(db: SupabaseClient, draftId: string, approvalId: string, actor: string): Promise<Record<string, unknown>> {
  const bundle = await loadDraftBundle(db, draftId);
  if (!bundle.draft.current_body) throw new Error("Draft body is empty");
  const now = new Date().toISOString();
  const { data: claimed, error: claimError } = await db.from("brain_approvals").update({
    status: "approved",
    action: "send",
    acted_by: actor,
    acted_at: now,
  }).eq("id", approvalId).eq("status", "pending").select("id").maybeSingle();
  if (claimError) throw new Error(claimError.message);
  if (!claimed) return { ok: true, duplicate: true, simulated: bundle.settings.dry_run || bundle.email.fixture };

  let sent: { id: string; threadId: string } | null = null;
  const simulate = bundle.settings.dry_run || bundle.email.fixture;
  try {
    if (!simulate) sent = await sendReply(bundle.email, bundle.draft.current_body);
  } catch (error) {
    await db.from("brain_approvals").update({ status: "failed" }).eq("id", approvalId);
    await db.from("brain_drafts").update({ status: "failed" }).eq("id", draftId);
    await db.from("brain_outcomes").insert({
      draft_id: draftId,
      conversation_id: bundle.draft.conversation_id,
      outcome_type: "send_failed",
      details: { actor, error: String(error) },
    });
    throw error;
  }
  await db.from("brain_drafts").update({
    status: simulate ? "sent_simulated" : "sent",
    final_sent_version: bundle.draft.current_body,
    sent_external_message_id: sent?.id ?? `dry-run:${draftId}`,
    sent_at: now,
  }).eq("id", draftId);
  await db.from("brain_approvals").update({ status: "sent" }).eq("id", approvalId);
  await db.from("brain_outcomes").insert({
    draft_id: draftId,
    conversation_id: bundle.draft.conversation_id,
    outcome_type: simulate ? "send_simulated" : "email_sent",
    details: { actor, external_message_id: sent?.id ?? null, version: bundle.draft.current_version },
  });
  if (bundle.draft.event_id) await markEvent(db, bundle.draft.event_id, "completed");
  return { ok: true, simulated: simulate, external_message_id: sent?.id ?? null };
}

export async function deferDraft(db: SupabaseClient, draftId: string, approvalId: string, actor: string): Promise<Record<string, unknown>> {
  const bundle = await loadDraftBundle(db, draftId);
  const due = new Date(Date.now() + bundle.settings.later_delay_hours * 60 * 60 * 1000).toISOString();
  const { data: claimed, error: claimError } = await db.from("brain_approvals").update({
    status: "later", action: "later", acted_by: actor, acted_at: new Date().toISOString(),
  }).eq("id", approvalId).eq("status", "pending").select("id").maybeSingle();
  if (claimError) throw new Error(claimError.message);
  if (!claimed) return { ok: true, duplicate: true, due_at: null };
  await db.from("brain_drafts").update({ status: "later" }).eq("id", draftId);
  await db.from("brain_tasks").insert({
    title: `Reply later: ${bundle.email.subject}`,
    description: `Reply to ${bundle.email.from}. A Pep draft is ready.`,
    status: "waiting",
    priority: bundle.draft.priority,
    conversation_id: bundle.draft.conversation_id,
    due_at: due,
    source: "slack-approval-later",
    metadata: { draft_id: draftId, approval_id: approvalId },
  });
  return { ok: true, due_at: due };
}

export async function requestChange(db: SupabaseClient, draftId: string, approvalId: string, actor: string): Promise<Record<string, unknown>> {
  const { data: approval, error } = await db.from("brain_approvals").update({
    status: "awaiting_feedback",
    action: "change",
    acted_by: actor,
    acted_at: new Date().toISOString(),
  }).eq("id", approvalId).eq("status", "pending").select("slack_channel_id,slack_thread_ts").maybeSingle();
  if (error) throw new Error(error.message);
  if (!approval) return { ok: true, duplicate: true, status: "already_handled" };
  await db.from("brain_drafts").update({ status: "awaiting_feedback" }).eq("id", draftId);
  if (approval.slack_channel_id !== "dry-run") {
    await postSlackMessage(approval.slack_channel_id, "Reply in this thread with what you want changed. I’ll regenerate the draft and post a fresh approval card.", approval.slack_thread_ts);
  }
  return { ok: true, status: "awaiting_feedback" };
}

export async function regenerateFromFeedback(db: SupabaseClient, approvalId: string, feedback: string, actor: string): Promise<Record<string, unknown>> {
  const { data: approval, error } = await db.from("brain_approvals").select("*").eq("id", approvalId).single();
  if (error) throw new Error(error.message);
  const bundle = await loadDraftBundle(db, approval.draft_id);
  const { data: claimed, error: claimError } = await db.from("brain_approvals").update({
    status: "superseded",
    feedback,
    acted_by: actor,
    acted_at: new Date().toISOString(),
  }).eq("id", approval.id).eq("status", "awaiting_feedback").select("id").maybeSingle();
  if (claimError) throw new Error(claimError.message);
  if (!claimed) return { ok: true, duplicate: true, draft_id: bundle.draft.id };
  const model = chooseDraftModel(bundle.draft.classification, bundle.settings);
  let result;
  try {
    if (!bundle.draft.event_id) throw new Error("Draft is missing its source event");
    result = await draftReply({
      db,
      settings: bundle.settings,
      email: bundle.email,
      classification: bundle.draft.classification,
      context: bundle.draft.retrieved_context,
      model,
      eventId: bundle.draft.event_id,
      draftId: bundle.draft.id,
      feedback,
    });
  } catch (redraftError) {
    await db.from("brain_approvals").update({ status: "failed" }).eq("id", approval.id);
    await db.from("brain_drafts").update({ status: "failed" }).eq("id", bundle.draft.id);
    throw redraftError;
  }
  const version = bundle.draft.current_version + 1;
  await db.from("brain_draft_versions").insert({
    draft_id: bundle.draft.id,
    version,
    body: result.draft.body,
    model: result.model,
    user_feedback: feedback,
    prompt_fingerprint: "refery-voice-v1",
  });
  await db.from("brain_drafts").update({
    status: "pending",
    current_body: result.draft.body,
    current_version: version,
    model: result.model,
  }).eq("id", bundle.draft.id);
  if (bundle.settings.dry_run || bundle.email.fixture || approval.slack_channel_id === "dry-run") {
    const { data: next } = await db.from("brain_approvals").insert({
      draft_id: bundle.draft.id,
      previous_approval_id: approval.id,
      status: "pending",
      slack_channel_id: "dry-run",
      slack_message_ts: `dry-run:${bundle.draft.id}:${version}`,
      slack_thread_ts: approval.slack_thread_ts,
    }).select("id").single();
    return { ok: true, draft_id: bundle.draft.id, approval_id: next?.id, version, simulated: true };
  }

  const posted = await postApproval({
    channel: approval.slack_channel_id,
    threadTs: approval.slack_thread_ts,
    draftId: bundle.draft.id,
    from: bundle.email.from,
    subject: bundle.email.subject,
    reason: bundle.draft.classification.reason,
    body: result.draft.body,
    model: result.model,
    dryRun: false,
    version,
  });
  const { data: next } = await db.from("brain_approvals").insert({
    draft_id: bundle.draft.id,
    previous_approval_id: approval.id,
    status: "pending",
    slack_channel_id: posted.channel,
    slack_message_ts: posted.ts,
    slack_thread_ts: posted.threadTs,
  }).select("id").single();
  return { ok: true, draft_id: bundle.draft.id, approval_id: next?.id, version, simulated: false, actor };
}

export async function updateSlackStatus(db: SupabaseClient, approvalId: string, text: string): Promise<void> {
  const { data } = await db.from("brain_approvals").select("slack_channel_id,slack_message_ts").eq("id", approvalId).maybeSingle();
  if (data?.slack_channel_id && data.slack_channel_id !== "dry-run" && data.slack_message_ts) {
    await replaceApprovalWithStatus(data.slack_channel_id, data.slack_message_ts, text);
  }
}

