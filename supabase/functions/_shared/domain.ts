import type { BrainSettings, Classification, DraftResult, IncomingEmail, Priority } from "./types.ts";

export const REFERY_VOICE = `
Write in Lily's Refery voice: direct, warm, punchy, premium, and human.
Answer the sender's question first. Use short paragraphs. Every sentence must earn its place.
Never use em dashes. Never use filler such as "just", "really", "actually", "basically", or "honestly".
Never sound salesy, over-praise, invent facts, or promise an action that the context does not support.
Do not add a subject line. Do not quote the incoming email. End with "Lily" only when a sign-off is natural.
`.trim();

export function extractAddress(value: string): string {
  const angle = value.match(/<([^>]+)>/);
  return (angle?.[1] ?? value).trim().toLowerCase();
}

export function extractDisplayName(value: string): string | null {
  const address = extractAddress(value);
  const raw = value.replace(/<[^>]+>/, "").replace(/^"|"$/g, "").trim();
  if (raw && raw.toLowerCase() !== address) return raw;
  const local = address.split("@")[0] ?? "";
  if (!local) return null;
  return local.split(/[._-]/).filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
}

export function extractDomain(value: string): string | null {
  const address = extractAddress(value);
  const domain = address.split("@")[1]?.toLowerCase() ?? null;
  if (!domain || ["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "icloud.com", "yahoo.com"].includes(domain)) {
    return null;
  }
  return domain;
}

const priorityRank: Record<Priority, number> = { low: 0, normal: 1, high: 2, urgent: 3 };

export function chooseDraftModel(classification: Classification, settings: BrainSettings): string {
  return priorityRank[classification.priority] >= priorityRank[settings.strong_model_min_priority]
    ? settings.strong_model
    : settings.cheap_model;
}

export function clampContext(value: unknown, maxChars: number): string {
  const raw = JSON.stringify(value, null, 2);
  if (raw.length <= maxChars) return raw;
  return `${raw.slice(0, Math.max(0, maxChars - 80))}\n...[context clipped by cost guardrail]`;
}

export function normalizePriority(value: unknown): Priority {
  return value === "low" || value === "high" || value === "urgent" ? value : "normal";
}

export function fixtureClassification(email: IncomingEmail): Classification {
  const text = `${email.subject}\n${email.body}`.toLowerCase();
  const automated = /no[-_ ]?reply|unsubscribe|receipt|notification/.test(`${email.from} ${text}`);
  const actionNeeded = !automated && (/\?|can you|could you|please|let me know|follow up|schedule|confirm/.test(text));
  return {
    action_needed: actionNeeded,
    action_type: automated ? "automated" : actionNeeded ? "reply" : "fyi",
    priority: /urgent|today|asap|deadline/.test(text) ? "high" : "normal",
    confidence: 0.99,
    sensitivity: /salary|compensation|legal|confidential|health/.test(text) ? "sensitive" : "normal",
    reason: automated ? "Automated message" : actionNeeded ? "The sender asks for a response" : "No explicit action requested",
    sender_name: extractDisplayName(email.from),
    company_name: null,
    entities: [],
  };
}

export function fixtureDraft(email: IncomingEmail, feedback?: string): DraftResult {
  const name = extractDisplayName(email.from)?.split(" ")[0] ?? "there";
  const requestedChange = feedback ? `\n\nI’ve also incorporated this: ${feedback.trim()}` : "";
  return {
    body: `Hi ${name},\n\nThanks for the note. This works on my side. I’ll take a look and come back with the next step.${requestedChange}\n\nLily`,
    rationale: "Safe deterministic fixture used for the dry-run integration test.",
    facts_to_remember: [],
    open_loops: [{ title: `Follow up on: ${email.subject}`, due_hint: null, priority: "normal" }],
    risk_flags: [],
  };
}

export function slackApprovalBlocks(input: {
  draftId: string;
  from: string;
  subject: string;
  reason: string;
  body: string;
  model: string;
  dryRun: boolean;
  version: number;
}): unknown[] {
  const safeBody = input.body.length > 2900 ? `${input.body.slice(0, 2890)}…` : input.body;
  return [
    { type: "header", text: { type: "plain_text", text: input.dryRun ? "Pep • TEST approval" : "Pep • Reply approval", emoji: true } },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*From*\n${input.from}` },
        { type: "mrkdwn", text: `*Subject*\n${input.subject}` },
      ],
    },
    { type: "context", elements: [{ type: "mrkdwn", text: `*Why:* ${input.reason}` }] },
    { type: "section", text: { type: "mrkdwn", text: `*Suggested reply, v${input.version}*\n\n${safeBody}` } },
    {
      type: "actions",
      block_id: `brain_approval_${input.draftId}`,
      elements: [
        { type: "button", text: { type: "plain_text", text: "SEND" }, style: "primary", action_id: "brain_send", value: input.draftId, confirm: { title: { type: "plain_text", text: "Send this reply?" }, text: { type: "mrkdwn", text: "This sends in the original Gmail thread." }, confirm: { type: "plain_text", text: "SEND" }, deny: { type: "plain_text", text: "Cancel" } } },
        { type: "button", text: { type: "plain_text", text: "CHANGE" }, action_id: "brain_change", value: input.draftId },
        { type: "button", text: { type: "plain_text", text: "LATER" }, action_id: "brain_later", value: input.draftId },
      ],
    },
    { type: "context", elements: [{ type: "mrkdwn", text: `${input.model} • hard budget checked${input.dryRun ? " • no email will be sent" : ""}` }] },
  ];
}

export function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

