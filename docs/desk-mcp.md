# The desk MCP

The candidate desk as tools inside an assistant. One user, one key, twelve
verbs, and a record of everything it did. Built from the operating review of
9 September 2026, which asked for exactly this and nothing wider: no partner
server yet, no client server until founders have candidates to decide on, and
never a candidate server.

Endpoint: `https://refery.xyz/api/mcp` (Streamable HTTP, stateless, JSON replies).
Settings: `https://refery.xyz/admin/settings#mcp`.

## Connect

1. On the settings page, **Issue a key**. It is shown once.
2. In Claude Code, on any machine:

   ```
   claude mcp add --transport http refery-desk https://refery.xyz/api/mcp --header "Authorization: Bearer <key>"
   ```

   Claude Desktop takes the same URL and header in its connector settings.
   claude.ai's custom connectors want OAuth, which this server does not do yet.
3. Ask: "what needs me today". The assistant calls `desk_inbox` first.

Rotating the key on the settings page stops the old one at the same moment.
Revoking leaves no key, and the endpoint answers 401 to everything.

## The verbs

Reads are always on.

| verb | what it answers |
| --- | --- |
| `desk_inbox` | everything waiting: decisions ranked by grade, stale proposals by partner, unanswered search questions, people stuck in a retired stage, spend |
| `candidate_brief` | one person: grade, evidence, seat fits and blockers, owner, journey, consent, missing facts, activity, emails |
| `search_status` | each live search: stage and days in it, partners against the cap, submissions, open questions |
| `partner_shortlist` | who to propose a search to, scored the way the onboarding matcher scores |
| `ownership_check` | who owns a person and until when, by id, email, LinkedIn or name |
| `spend_status` | the month's model spend by source against the cap |
| `draft_email` | the intro ask, bench note, passing note or intro kit as text. Never sends. |

Writes are off until switched on, one by one, on the settings page. Each one
is a verb that already exists as a reaction or a button, is written with Lily
as the actor, and is mirrored into the Slack thread it belongs to.

| verb | what it does |
| --- | --- |
| `decide_candidate` | the card reactions: intro now, bench, not a fit (with a reason line), snooze, manual. Up to 20 at once. Sends the same email the reaction would. |
| `propose_search` | puts partners on a search as a proposal and sends the proposal email |
| `send_desk_email` | one email from lily@refery.io, refused unless `confirm: true` |
| `run_bench` | re-matches one seat against the bench now, posting bench cards |
| `note` | a line onto a candidate's timeline and Slack thread, or a search's internal notes |

## The rules it keeps

- **No query tool.** Named verbs only.
- **Surname and contact wait for consent.** Until `candidate_consents` holds an
  agreed row, a person is "Maryam O." with no email, phone or LinkedIn. The id
  is always there, so a decision can still name them. The one exception is
  `draft_email`, whose output is the email itself and carries the name the
  email will.
- **Every call is journaled** in `desk_mcp_calls`, with long strings cut short
  and email bodies replaced by their length. The last twenty are on the
  settings page.
- **Read content is data.** Every result opens with the line that says so, and
  the server instructions repeat it.
- **Drafting and sending are different tools.**

## Where things live

- `lib/mcp/protocol.ts` JSON-RPC dispatch, pure, tested in `tests/mcp/`
- `lib/mcp/tools.ts` the twelve verbs
- `lib/mcp/auth.ts` the key (SHA-256 in `desk_settings.mcp_token`)
- `lib/mcp/settings.ts` the write switches (`desk_settings.mcp_writes`)
- `lib/mcp/journal.ts` the record (`desk_mcp_calls`)
- `app/api/mcp/route.ts` the endpoint
- `app/api/admin/mcp/route.ts` and `components/admin/desk-mcp.tsx` the settings card
