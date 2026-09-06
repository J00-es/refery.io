import { decodeBase64Url } from "./domain.ts";
import { adminClient } from "./db.ts";
import { buildReplyRequest } from "./gmail-reply.ts";
import { googleAccessToken } from "./google-auth.ts";
import type { IncomingEmail } from "./types.ts";

export { buildReplyRequest } from "./gmail-reply.ts";

interface GmailPart {
  mimeType?: string;
  filename?: string;
  body?: { data?: string };
  parts?: GmailPart[];
  headers?: Array<{ name: string; value: string }>;
}

interface GmailMessage {
  id: string;
  threadId: string;
  internalDate?: string;
  historyId?: string;
  payload?: GmailPart;
}

function header(part: GmailPart | undefined, name: string): string {
  return part?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function textBody(part: GmailPart | undefined): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) return decodeBase64Url(part.body.data);
  for (const child of part.parts ?? []) {
    const found = textBody(child);
    if (found) return found;
  }
  if (part.mimeType === "text/html" && part.body?.data) {
    return decodeBase64Url(part.body.data)
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
  }
  return "";
}

function attachmentMetadata(part: GmailPart | undefined): Array<{ filename: string; mime_type: string }> {
  if (!part) return [];
  const current = part.filename?.trim()
    ? [{ filename: part.filename.trim(), mime_type: part.mimeType ?? "application/octet-stream" }]
    : [];
  return current.concat((part.parts ?? []).flatMap((child) => attachmentMetadata(child)));
}

async function gmailFetch(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const token = await googleAccessToken(adminClient());
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const payload = response.status === 204 ? {} : await response.json();
  if (!response.ok) throw new Error(`Gmail ${response.status}: ${JSON.stringify(payload).slice(0, 800)}`);
  return payload;
}

export async function getMessage(id: string): Promise<IncomingEmail> {
  const message = await gmailFetch(`/messages/${encodeURIComponent(id)}?format=full`) as unknown as GmailMessage;
  const to = header(message.payload, "To").split(",").map((x) => x.trim()).filter(Boolean);
  const cc = header(message.payload, "Cc").split(",").map((x) => x.trim()).filter(Boolean);
  const headers = Object.fromEntries((message.payload?.headers ?? []).map((h) => [h.name, h.value]));
  return {
    externalMessageId: message.id,
    externalThreadId: message.threadId,
    historyId: message.historyId,
    from: header(message.payload, "From"),
    to,
    cc,
    subject: header(message.payload, "Subject"),
    body: textBody(message.payload),
    attachments: attachmentMetadata(message.payload),
    receivedAt: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : new Date().toISOString(),
    headers,
    raw: { gmail_id: message.id, gmail_thread_id: message.threadId, history_id: message.historyId },
  };
}

export async function getThread(threadId: string, maxMessages = 12): Promise<Array<Record<string, unknown>>> {
  const result = await gmailFetch(`/threads/${encodeURIComponent(threadId)}?format=full`) as { messages?: GmailMessage[] };
  return (result.messages ?? []).slice(-maxMessages).map((message) => ({
    id: message.id,
    at: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : null,
    from: header(message.payload, "From"),
    to: header(message.payload, "To"),
    subject: header(message.payload, "Subject"),
    body: textBody(message.payload).slice(0, 7000),
    attachments: attachmentMetadata(message.payload),
  }));
}

export async function listInboxMessageIds(query: string, maxResults = 25): Promise<string[]> {
  const params = new URLSearchParams({ q: query, maxResults: String(maxResults), labelIds: "INBOX" });
  const result = await gmailFetch(`/messages?${params}`) as { messages?: Array<{ id: string }> };
  return (result.messages ?? []).map((message) => message.id);
}

export async function historyMessageIds(startHistoryId: string): Promise<{ ids: string[]; historyId: string }> {
  const params = new URLSearchParams({ startHistoryId, historyTypes: "messageAdded", labelId: "INBOX", maxResults: "100" });
  const result = await gmailFetch(`/history?${params}`) as {
    history?: Array<{ messagesAdded?: Array<{ message: { id: string } }> }>;
    historyId?: string;
  };
  const ids = [...new Set((result.history ?? []).flatMap((item) => item.messagesAdded ?? []).map((item) => item.message.id))];
  return { ids, historyId: result.historyId ?? startHistoryId };
}

export async function renewWatch(): Promise<{ historyId: string; expiration: string }> {
  const topicName = Deno.env.get("GMAIL_PUBSUB_TOPIC");
  if (!topicName) throw new Error("Missing GMAIL_PUBSUB_TOPIC");
  return await gmailFetch("/watch", {
    method: "POST",
    body: JSON.stringify({ topicName, labelIds: ["INBOX"], labelFilterBehavior: "include" }),
  }) as { historyId: string; expiration: string };
}

export async function sendReply(email: IncomingEmail, body: string): Promise<{ id: string; threadId: string }> {
  const request = buildReplyRequest(email, body);
  const result = await gmailFetch("/messages/send", {
    method: "POST",
    body: JSON.stringify(request),
  });
  return { id: String(result.id), threadId: String(result.threadId) };
}

