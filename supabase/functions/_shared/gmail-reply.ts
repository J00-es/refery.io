import { encodeBase64Url } from "./domain.ts";
import type { IncomingEmail } from "./types.ts";

export function buildReplyRequest(email: IncomingEmail, body: string): { raw: string; threadId: string } {
  const replyTo = email.headers?.["Reply-To"] || email.from;
  const messageId = email.headers?.["Message-ID"] || email.headers?.["Message-Id"] || "";
  const priorReferences = email.headers?.References?.trim() ?? "";
  const references = [priorReferences, messageId].filter(Boolean).join(" ");
  // Gmail requires an exact matching Subject, the original threadId, and
  // RFC-compliant References/In-Reply-To headers to keep a reply in-thread.
  const lines = [
    `To: ${replyTo}`,
    `Subject: ${email.subject}`,
    ...(messageId ? [`In-Reply-To: ${messageId}`, `References: ${references}`] : []),
    "Content-Type: text/plain; charset=UTF-8",
    "MIME-Version: 1.0",
    "",
    body,
  ];
  return { raw: encodeBase64Url(lines.join("\r\n")), threadId: email.externalThreadId };
}

