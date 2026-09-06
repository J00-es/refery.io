import { slackApprovalBlocks } from "./domain.ts";

function slackToken(): string {
  const token = Deno.env.get("SLACK_BOT_TOKEN");
  if (!token) throw new Error("Missing SLACK_BOT_TOKEN Edge Function secret");
  return token;
}

async function slackApi(method: string, payload: Record<string, unknown>, token = slackToken()): Promise<Record<string, unknown>> {
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });
  const result = await response.json() as Record<string, unknown>;
  if (!response.ok || result.ok !== true) throw new Error(`Slack ${method} failed: ${JSON.stringify(result).slice(0, 800)}`);
  return result;
}

async function slackGet(method: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const query = new URLSearchParams(params);
  const response = await fetch(`https://slack.com/api/${method}?${query}`, {
    headers: { authorization: `Bearer ${slackToken()}` },
  });
  const result = await response.json() as Record<string, unknown>;
  if (!response.ok || result.ok !== true) throw new Error(`Slack ${method} failed: ${JSON.stringify(result).slice(0, 800)}`);
  return result;
}

export async function checkSlackAccess(channel: string): Promise<Record<string, unknown>> {
  const auth = await slackApi("auth.test", {});
  try {
    const info = await slackGet("conversations.info", { channel });
    const details = info.channel as Record<string, unknown> | undefined;
    return {
      token_valid: true,
      team_id: auth.team_id,
      bot_user_id: auth.user_id,
      channel_access: true,
      channel_id: details?.id ?? channel,
      channel_name: details?.name,
      is_member: details?.is_member === true,
    };
  } catch (error) {
    return {
      token_valid: true,
      team_id: auth.team_id,
      bot_user_id: auth.user_id,
      channel_access: false,
      channel_id: channel,
      error: String(error).slice(0, 500),
    };
  }
}

export async function verifySlackRequest(rawBody: string, timestamp: string, signature: string): Promise<boolean> {
  const secret = Deno.env.get("SLACK_SIGNING_SECRET");
  if (!secret || !timestamp || !signature) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 60 * 5) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`v0:${timestamp}:${rawBody}`));
  const digest = Array.from(new Uint8Array(bytes)).map((value) => value.toString(16).padStart(2, "0")).join("");
  const expected = `v0=${digest}`;
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return mismatch === 0;
}

export async function postApproval(input: {
  channel: string;
  threadTs?: string | null;
  draftId: string;
  from: string;
  subject: string;
  reason: string;
  body: string;
  model: string;
  dryRun: boolean;
  version: number;
  incoming?: string | null;
}): Promise<{ channel: string; ts: string; threadTs: string }> {
  const result = await slackApi("chat.postMessage", {
    channel: input.channel,
    thread_ts: input.threadTs ?? undefined,
    text: `Approval needed: reply to ${input.from} about ${input.subject}`,
    blocks: slackApprovalBlocks(input),
    unfurl_links: false,
    unfurl_media: false,
  });
  const ts = String(result.ts);
  return { channel: String(result.channel ?? input.channel), ts, threadTs: input.threadTs ?? ts };
}

export async function postSlackMessage(channel: string, text: string, threadTs?: string | null): Promise<{ ts: string }> {
  const result = await slackApi("chat.postMessage", { channel, text, thread_ts: threadTs ?? undefined });
  return { ts: String(result.ts) };
}

export async function replaceApprovalWithStatus(channel: string, ts: string, text: string): Promise<void> {
  await slackApi("chat.update", {
    channel,
    ts,
    text,
    blocks: [{ type: "section", text: { type: "mrkdwn", text } }],
  });
}

export async function searchSlack(query: string): Promise<Array<Record<string, unknown>>> {
  const token = Deno.env.get("SLACK_SEARCH_TOKEN");
  if (!token || !query.trim()) return [];
  const params = new URLSearchParams({ query, count: "20", sort: "timestamp", sort_dir: "desc" });
  const response = await fetch(`https://slack.com/api/search.messages?${params}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const payload = await response.json() as Record<string, any>;
  if (!response.ok || payload.ok !== true) return [];
  return (payload.messages?.matches ?? []).slice(0, 20).map((match: Record<string, any>) => ({
    channel_id: match.channel?.id,
    channel_name: match.channel?.name,
    ts: match.ts,
    username: match.username,
    text: String(match.text ?? "").slice(0, 2500),
    permalink: match.permalink,
  }));
}

