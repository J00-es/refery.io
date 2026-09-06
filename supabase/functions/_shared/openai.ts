import type { SupabaseClient } from "npm:@supabase/supabase-js@2.95.0";
import type { BrainSettings, Classification, DraftResult, IncomingEmail } from "./types.ts";
import { clampContext, fixtureClassification, fixtureDraft, REFERY_VOICE } from "./domain.ts";

const classificationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["action_needed", "action_type", "priority", "confidence", "sensitivity", "reason", "sender_name", "company_name", "entities"],
  properties: {
    action_needed: { type: "boolean" },
    action_type: { type: "string", enum: ["reply", "follow_up", "task", "fyi", "spam", "automated"] },
    priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    sensitivity: { type: "string", enum: ["normal", "sensitive"] },
    reason: { type: "string" },
    sender_name: { type: ["string", "null"] },
    company_name: { type: ["string", "null"] },
    entities: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "name"],
        properties: {
          type: { type: "string", enum: ["person", "company", "role", "candidate"] },
          name: { type: "string" },
        },
      },
    },
  },
} as const;

const draftSchema = {
  type: "object",
  additionalProperties: false,
  required: ["body", "rationale", "facts_to_remember", "open_loops", "risk_flags"],
  properties: {
    body: { type: "string" },
    rationale: { type: "string" },
    facts_to_remember: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["predicate", "value", "confidence"],
        properties: {
          predicate: { type: "string" },
          value: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
    open_loops: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "due_hint", "priority"],
        properties: {
          title: { type: "string" },
          due_hint: { type: ["string", "null"] },
          priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
        },
      },
    },
    risk_flags: { type: "array", maxItems: 10, items: { type: "string" } },
  },
} as const;

function responseText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? (item as Record<string, unknown>).content as Array<Record<string, unknown>>
      : [];
    const found = content.find((part) => part.type === "output_text" && typeof part.text === "string");
    if (found) return found.text as string;
  }
  throw new Error("OpenAI response had no output text");
}

async function runStructured<T>(args: {
  db: SupabaseClient;
  settings: BrainSettings;
  model: string;
  requestKind: string;
  instructions: string;
  input: string;
  schemaName: string;
  schema: Record<string, unknown>;
  maxOutputTokens: number;
  eventId?: string | null;
  draftId?: string | null;
}): Promise<{ value: T; model: string; usageId: string; actualUsd: number }> {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("Missing OPENAI_API_KEY Edge Function secret");

  const { data: pricing, error: pricingError } = await args.db
    .from("brain_model_pricing")
    .select("input_usd_per_million,output_usd_per_million")
    .eq("model", args.model)
    .single();
  if (pricingError) throw new Error(`Missing pricing for ${args.model}: ${pricingError.message}`);

  const estimatedInputTokens = Math.ceil((args.instructions.length + args.input.length) / 3.5);
  const estimate = ((estimatedInputTokens * Number(pricing.input_usd_per_million)) +
    (args.maxOutputTokens * Number(pricing.output_usd_per_million))) / 1_000_000 * 1.2;

  const { data: reservations, error: reserveError } = await args.db.rpc("brain_reserve_budget", {
    p_request_kind: args.requestKind,
    p_model: args.model,
    p_estimated_usd: estimate,
    p_event_id: args.eventId ?? null,
    p_draft_id: args.draftId ?? null,
    p_metadata: { estimated_input_tokens: estimatedInputTokens, max_output_tokens: args.maxOutputTokens },
  });
  if (reserveError) throw new Error(`Budget guardrail failed: ${reserveError.message}`);
  const reservation = reservations?.[0];
  if (!reservation?.allowed) throw new Error(`MONTHLY_BUDGET_BLOCKED:${reservation?.remaining_usd ?? 0}`);

  const usageId = reservation.usage_id as string;
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: args.model,
        store: false,
        reasoning: { effort: "low" },
        max_output_tokens: args.maxOutputTokens,
        prompt_cache_key: `refery-brain-${args.requestKind}`,
        instructions: args.instructions,
        input: args.input,
        text: {
          verbosity: "low",
          format: { type: "json_schema", name: args.schemaName, strict: true, schema: args.schema },
        },
      }),
    });
    const payload = await response.json() as Record<string, unknown>;
    if (!response.ok) throw new Error(`OpenAI ${response.status}: ${JSON.stringify(payload).slice(0, 800)}`);

    const usage = (payload.usage ?? {}) as Record<string, unknown>;
    const inputTokens = Number(usage.input_tokens ?? 0);
    const outputTokens = Number(usage.output_tokens ?? 0);
    const actualUsd = ((inputTokens * Number(pricing.input_usd_per_million)) +
      (outputTokens * Number(pricing.output_usd_per_million))) / 1_000_000;

    await args.db.rpc("brain_finalize_budget", {
      p_usage_id: usageId,
      p_actual_usd: actualUsd,
      p_input_tokens: inputTokens,
      p_output_tokens: outputTokens,
      p_status: "completed",
    });

    return { value: JSON.parse(responseText(payload)) as T, model: args.model, usageId, actualUsd };
  } catch (error) {
    await args.db.rpc("brain_finalize_budget", {
      p_usage_id: usageId,
      p_actual_usd: 0,
      p_input_tokens: 0,
      p_output_tokens: 0,
      p_status: "failed",
    });
    throw error;
  }
}

export async function classifyEmail(args: {
  db: SupabaseClient;
  settings: BrainSettings;
  email: IncomingEmail;
  eventId: string;
}): Promise<{ classification: Classification; model: string; actualUsd: number }> {
  if (args.email.fixture && !args.email.liveModels) {
    return { classification: fixtureClassification(args.email), model: "fixture-classifier", actualUsd: 0 };
  }
  const result = await runStructured<Classification>({
    db: args.db,
    settings: args.settings,
    model: args.settings.cheap_model,
    requestKind: "classification",
    eventId: args.eventId,
    maxOutputTokens: 500,
    schemaName: "refery_email_classification",
    schema: classificationSchema as unknown as Record<string, unknown>,
    instructions: `Classify an inbound email for Lily at Refery. Be conservative. Newsletters, receipts, automated alerts, cold sales, and messages with no requested action normally need no reply. Return only schema-valid JSON.`,
    input: clampContext(args.email, 12000),
  });
  return { classification: result.value, model: result.model, actualUsd: result.actualUsd };
}

export async function draftReply(args: {
  db: SupabaseClient;
  settings: BrainSettings;
  email: IncomingEmail;
  classification: Classification;
  context: Record<string, unknown>;
  model: string;
  eventId: string;
  draftId?: string;
  feedback?: string;
}): Promise<{ draft: DraftResult; model: string; actualUsd: number }> {
  if (args.email.fixture && !args.email.liveModels) {
    return { draft: fixtureDraft(args.email, args.feedback), model: "fixture-drafter", actualUsd: 0 };
  }
  const instructions = `${REFERY_VOICE}\n\nUse only the supplied email and context. If context conflicts, prefer the newest primary source. Address every still-unanswered question or request visible in the recent thread when the supplied facts allow it. Never ask for information that the sender already supplied, including files named in incoming_email.attachments. If a material answer is unknown, say it needs confirmation rather than inventing it or silently omitting the question. Do not mention internal notes, model reasoning, retrieval, or approval. Return only schema-valid JSON.`;
  const input = clampContext({
    incoming_email: args.email,
    classification: args.classification,
    context: args.context,
    requested_change: args.feedback ?? null,
  }, args.settings.max_context_chars);
  const result = await runStructured<DraftResult>({
    db: args.db,
    settings: args.settings,
    model: args.model,
    requestKind: args.feedback ? "redraft" : "draft",
    eventId: args.eventId,
    draftId: args.draftId,
    maxOutputTokens: 900,
    schemaName: "refery_reply_draft",
    schema: draftSchema as unknown as Record<string, unknown>,
    instructions,
    input,
  });
  return { draft: result.value, model: result.model, actualUsd: result.actualUsd };
}

