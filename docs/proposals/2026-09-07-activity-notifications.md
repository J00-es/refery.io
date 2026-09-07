# Who is on refery.xyz, and what they do

Date: 2026-09-07. Status: built the same day; see "What was built" at the end.

## The question

Lily wants to know when a partner signs in, who is active week to week, and what
people actually do inside the app. Constraint: no new subscription, no AI spend.

## What already exists, free

- Sign-in is Supabase Auth, email and password only (no magic link, no
  Google login). Every sign-in creates a row in `auth.sessions`. Every token
  refresh stamps `refreshed_at` on that row, roughly hourly while a tab is open.
  `auth.users.last_sign_in_at` is also kept. This is the login log, and it has
  been collecting since day one. Nothing to install.
- The database already runs pg_cron and pg_net, and `desk_cron_post()` calls a
  refery.xyz cron route with the cron secret. Five desk jobs use it today.
- Two database triggers already post straight to `/api/intake/notify` and on to
  Slack (scout applications, hiring leads). The pattern is proven.
- `lib/slack.ts` posts to a webhook per stream; `lib/slack-bot.ts` posts as the
  Refery Ops bot. Both cost nothing.
- The 08:00 Seoul daily digest already reports "dormant partners", but measures
  dormancy by account age plus candidate ownership. It has never seen a login,
  so a partner who signs in every day and submits nobody counts as dormant.
- `@vercel/analytics` is mounted in `app/layout.tsx`, but Web Analytics is not
  enabled on the Vercel project (the API returns "Web Analytics not found").
  The component is silently dropping every event. Even enabled, it is
  anonymous: it can say `/searches` had 40 views, never that Gina viewed it.

## What the login table says today

Snapshot at 16:30 UTC on 2026-09-07:

| Window | People who signed in |
| --- | --- |
| Last 7 days | 22 of 82 accounts |
| Last 30 days | 46 of 82 accounts |
| Today | 9 people, 16 fresh sessions |

Today's nine are almost all beta recruiters plus three scouts, which is the
Searches launch landing. The daily digest could not have told Lily this.

## What is missing

1. Nobody is told when someone signs in.
2. Nothing records which pages a signed-in person visits. Writes are already
   visible (submissions, proposals, decisions, questions), but reads are not:
   who opened a search and walked away, who looked at the pipeline, who never
   got past the dashboard.

## Recommendation: three small pieces, all inside what we already pay for

### 1. A "last seen" view over the auth tables (SQL only, 30 minutes)

A `public.user_presence` view (security definer function, granted to
`service_role` only, since PostgREST cannot read the `auth` schema) joining
`auth.users` and `auth.sessions` to `users_admin`: email, name, role, beta,
`last_sign_in_at`, `last_active_at` (max `refreshed_at`), sign-ins this week.

Surfaces:

- A "Last seen" column on `/admin/users`, sortable.
- The daily digest's dormancy measure switches to "no sign-in in 14 days",
  and gains one line: "Yesterday 9 people signed in: Gina, Alexis, Leigh...".

### 2. A sign-in feed in Slack (cron, not trigger)

Every 15 minutes a pg_cron job calls `/api/cron/activity` through
`desk_cron_post`. The route reads sessions created since the last run and
posts one batched message to a new channel, `#refery-pulse`:

```
:door: Signed in (last 15 min)
Gina Quinlan   recruiter, beta   3rd visit this week   last time: viewed 2 searches, submitted 1
Kavish Ikram   scout             first visit since 28 Aug
```

Why a cron and not a trigger on `auth.sessions`: a trigger on the auth schema
runs inside the sign-in transaction, so a bug there blocks logins, and Supabase
can change those tables under us. Fifteen minutes of latency costs nothing;
a broken login page costs a partner.

Why a separate channel: the 6 Sep brief for `#refery-desk` is "critical only,
three kinds of card". Sign-ins are not critical. A channel Lily can mute later
keeps that promise. The feed can be turned down to daily-only by changing one
cron schedule once the launch curiosity passes.

### 3. A page-visit log for signed-in users (the "what they do" half)

A `user_activity` table: `user_id`, `path`, `route` (the pattern, e.g.
`/searches/[id]`), `entity_id`, `at`. Written by a tiny client beacon in the
signed-in layout that fires `navigator.sendBeacon` to `/api/activity/track`
on each route change. This is the same mechanism the hiring-manager briefs
already use (`components/hm/brief-telemetry.tsx` writing `hm_brief_events`),
so the pattern is proven in this codebase. The route resolves the user from
the session cookie and inserts one row.

Why not write from the middleware or from `getAppUser()`: the middleware is
the sign-in path and should stay free of writes, and layouts do not re-render
on in-app navigation, so a server-side hook would miss most page views.

No IP, no user agent, no form contents. Paths only. Pruned after 90 days by
the existing retention cron.

This is what turns the Slack line and the digest from "signed in" into "opened
the Acme search twice, never submitted". It also gives an exact "last seen"
instead of the hourly token refresh.

Route labels for the digest are a static map, no model call:
`/searches/[id]` is "viewed a search", `/candidates/new` is "started a
candidate", `/pipeline` is "checked the pipeline".

## Cost

| Piece | Where it runs | Marginal cost |
| --- | --- | --- |
| Presence view | Supabase, existing project | none |
| Sign-in feed | pg_cron + one Vercel route, 96 calls a day | none inside either plan |
| Activity log | one function call per page navigation, ~300 a day at today's traffic; ~10k rows a month | none inside either plan |
| Slack | incoming webhook | none |
| AI | not used anywhere | none |

Vercel Web Analytics is the only thing that could ever bill (past the plan's
included events). The recommendation does not use it. Either enable it for
anonymous marketing-page counts or remove the component; today it does
nothing.

## Not recommended

- A trigger on `auth.sessions` (see above).
- PostHog, Mixpanel, LogRocket: free tiers exist, but they add a script per
  partner page, a vendor, and a bill the moment traffic grows. The three
  pieces above answer Lily's actual question with data we already own.
- Same-day per-login emails: Lily's notification policy is Slack for her,
  digest for partners.

## Order of work

1. Presence function plus admin column plus digest lines (one deploy, one
   migration).
2. Activity table, beacon, track route, retention rule.
3. Cron route and `#refery-pulse` webhook, reading both.

Each step is useful alone. Step 1 answers "who is active" tonight.

## What was built (2026-09-07)

- Migration `user_activity_and_presence`: `user_activity` table, `pulse_cursor`
  watermark, `user_presence()` and `recent_sign_ins(since)` functions
  (security definer, service_role only), nightly pg_cron purge of page views
  older than 90 days.
- `lib/activity.ts`: route table and labels, `summariseActivity`, presence and
  sign-in loaders, `ago`.
- `components/activity-beacon.tsx` mounted in the dashboard layout, posting to
  `app/api/activity/track` on every route change (production only, paths only).
- `app/api/cron/pulse/route.ts`: the sign-in feed, every 15 minutes via
  `desk_cron_post('/api/cron/pulse')`, posting to `#refery-pulse`
  (`C0C087E7C4U`, override with `SLACK_CHANNEL_PULSE`). The name
  `#refery-activity` was taken by an archived channel from August.
- Daily digest: a "Partners on the site" field naming who signed in yesterday,
  and the dormancy line now means "not seen for 14+ days" rather than
  "joined 14+ days ago and never submitted". `/admin/funnel` copy follows.
- `/admin/users`: "seen 2h ago" on every row and a "Recently seen first" sort.
