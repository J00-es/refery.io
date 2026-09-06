import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { adminClient } from "../_shared/db.ts";
import { decodeBase64Url } from "../_shared/domain.ts";
import { getMessage, getThread, historyMessageIds, listInboxMessageIds, renewWatch } from "../_shared/gmail.ts";
import { errorResponse, json, timingSafeEqual } from "../_shared/http.ts";
import { processIncomingEmail } from "../_shared/pipeline.ts";
import { checkSlackAccess } from "../_shared/slack.ts";
import type { IncomingEmail } from "../_shared/types.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

async function requireGmailRequestAuth(req: Request): Promise<void> {
  const url = new URL(req.url);
  const provided = req.headers.get("x-refery-brain-secret") ?? url.searchParams.get("token") ?? "";
  const edgeSecret = Deno.env.get("BRAIN_GMAIL_WEBHOOK_SECRET") ?? "";
  if (edgeSecret && timingSafeEqual(provided, edgeSecret)) return;
  if (!provided) throw new Error("Unauthorized");

  // Cron keeps its independently generated credential in Supabase Vault. The
  // validator RPC is executable only by service_role and reads Vault as the
  // service_role invoker, so the credential never needs to be copied into code.
  const { data, error } = await adminClient().rpc("brain_validate_cron_secret", { candidate: provided });
  if (error || data !== true) throw new Error("Unauthorized");
}

async function processIds(ids: string[]): Promise<Array<Record<string, unknown>>> {
  const db = adminClient();
  const results: Array<Record<string, unknown>> = [];
  for (const id of [...new Set(ids)].slice(0, 25)) {
    try {
      const email = await getMessage(id);
      const thread = await getThread(email.externalThreadId);
      results.push(await processIncomingEmail({ db, email, gmailThread: thread }));
    } catch (error) {
      console.error(JSON.stringify({ level: "error", message_id: id, error: String(error) }));
      results.push({ ok: false, message_id: id, error: "processing_failed" });
    }
  }
  return results;
}

async function handlePush(payload: Record<string, any>): Promise<void> {
  const decoded = JSON.parse(decodeBase64Url(String(payload.message?.data ?? ""))) as { emailAddress: string; historyId: string };
  if (!decoded.emailAddress || !decoded.historyId) throw new Error("Invalid Gmail Pub/Sub notification");
  const db = adminClient();
  const { data: state } = await db.from("brain_mailbox_state").select("*").eq("mailbox_email", decoded.emailAddress).maybeSingle();
  let ids: string[] = [];
  let nextHistoryId = decoded.historyId;
  if (state?.gmail_history_id) {
    try {
      const history = await historyMessageIds(state.gmail_history_id);
      ids = history.ids;
      nextHistoryId = history.historyId;
    } catch (error) {
      console.warn(JSON.stringify({ level: "warn", message: "Gmail history cursor expired; using catch-up poll", error: String(error) }));
      ids = await listInboxMessageIds("is:unread -from:me newer_than:2d", 25);
    }
  } else {
    ids = await listInboxMessageIds("is:unread -from:me newer_than:2d", 25);
  }
  await processIds(ids);
  await db.from("brain_mailbox_state").upsert({
    mailbox_email: decoded.emailAddress,
    gmail_history_id: nextHistoryId,
    last_notification_at: new Date().toISOString(),
  }, { onConflict: "mailbox_email" });
}

async function handleCommand(payload: Record<string, any>): Promise<Record<string, unknown>> {
  const db = adminClient();
  if (payload.mode === "test_email") {
    const email = {
      ...(payload.email as IncomingEmail),
      fixture: true,
      liveModels: payload.live_models === true,
      publishSlackTest: payload.publish_slack === true,
    };
    return await processIncomingEmail({ db, email, gmailThread: payload.gmail_thread ?? [] });
  }
  if (payload.mode === "poll") {
    const ids = await listInboxMessageIds(String(payload.query ?? "is:unread -from:me newer_than:2d"), Number(payload.max_results ?? 25));
    const results = await processIds(ids);
    await db.from("brain_mailbox_state").upsert({
      mailbox_email: Deno.env.get("GMAIL_ACCOUNT_EMAIL") ?? "lily@refery.io",
      last_polled_at: new Date().toISOString(),
    }, { onConflict: "mailbox_email" });
    return { ok: true, checked: ids.length, results };
  }
  if (payload.mode === "connector_health") {
    const { data: config, error } = await db.from("brain_settings")
      .select("approval_channel_id")
      .eq("id", 1)
      .single();
    if (error || !config?.approval_channel_id) throw new Error("Missing Slack approval channel configuration");
    return { ok: true, slack: await checkSlackAccess(config.approval_channel_id) };
  }
  if (payload.mode === "renew_watch") {
    const watch = await renewWatch();
    await db.from("brain_mailbox_state").upsert({
      mailbox_email: Deno.env.get("GMAIL_ACCOUNT_EMAIL") ?? "lily@refery.io",
      gmail_history_id: watch.historyId,
      watch_expiration: new Date(Number(watch.expiration)).toISOString(),
    }, { onConflict: "mailbox_email" });
    return { ok: true, watch_expiration: new Date(Number(watch.expiration)).toISOString() };
  }
  throw new Error("Unsupported Gmail command");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  try {
    await requireGmailRequestAuth(req);
    const payload = await req.json() as Record<string, any>;
    if (payload.message?.data) {
      EdgeRuntime.waitUntil(handlePush(payload));
      return json({ ok: true, accepted: true }, 202);
    }
    return json(await handleCommand(payload));
  } catch (error) {
    return errorResponse(error);
  }
});

