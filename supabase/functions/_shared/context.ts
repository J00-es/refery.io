import type { SupabaseClient } from "npm:@supabase/supabase-js@2.95.0";
import { extractAddress, extractDisplayName, extractDomain } from "./domain.ts";
import { searchSlack } from "./slack.ts";
import type { IncomingEmail } from "./types.ts";

export async function gatherContext(args: {
  db: SupabaseClient;
  email: IncomingEmail;
  personId: string | null;
  companyId: string | null;
  gmailThread?: Array<Record<string, unknown>>;
}): Promise<Record<string, unknown>> {
  const address = extractAddress(args.email.from);
  const domain = extractDomain(address);
  const { data: structured, error } = await args.db.rpc("brain_gather_context", {
    p_email: address,
    p_domain: domain,
    p_person_id: args.personId,
    p_company_id: args.companyId,
  });
  if (error) throw new Error(`Context retrieval failed: ${error.message}`);

  const senderName = extractDisplayName(args.email.from);
  const slackQuery = [address, domain, senderName ? `"${senderName}"` : null].filter(Boolean).join(" OR ");
  const slack = await searchSlack(slackQuery);
  const knowledgeQuery = [args.email.subject, senderName, address, domain].filter(Boolean).join(" ");
  const { data: knowledge, error: knowledgeError } = await args.db.rpc("brain_search_knowledge", {
    p_query: knowledgeQuery,
    p_agent_scope: "refery-inbox",
    p_limit: 6,
  });
  if (knowledgeError) throw new Error(`Knowledge retrieval failed: ${knowledgeError.message}`);

  return {
    gmail_thread: args.gmailThread ?? [],
    slack_messages: slack,
    structured_records: structured ?? {},
    company_knowledge: knowledge ?? [],
    retrieval_policy: {
      newest_first: true,
      gmail_thread_limit: 12,
      granola_meeting_limit: 5,
      slack_result_limit: 20,
      company_knowledge_limit: 6,
      stale_knowledge_is_labeled_and_down_ranked: true,
      context_is_untrusted_data: true,
    },
  };
}

