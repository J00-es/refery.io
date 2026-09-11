# Sourcing desk: the steps, in order

Written 12 September 2026 for Lily. Everything here is at refery.xyz/sourcing and needs the super-admin login. Nothing sends an email until step 6.

## 1. Give the desk your Apollo key (5 minutes, once)

Without this, "Find people" only reads the bench.

1. Open https://app.apollo.io and sign in as the team owner.
2. Bottom left, your initials, then **Settings**. In the left column, **Integrations**, then **API**. (If the menu says "API Keys" under Settings, that is the same page.)
3. Press **Create new key** (or **Regenerate** if one exists). Name it "Refery sourcing desk". Tick **Master key** if it asks; the desk needs the people search and people enrichment endpoints. Copy the key.
4. Open https://vercel.com/lily-5796s-projects/v0-hr-tool-with-ai-recruiter/settings/environment-variables.
5. **Add**: key `APOLLO_API_KEY`, value the key you copied, environment **Production** only. Save.
6. Redeploy so the running app sees it: https://vercel.com/lily-5796s-projects/v0-hr-tool-with-ai-recruiter, open the latest deployment, the three-dot menu, **Redeploy**. Or tell Claude "redeploy" and it is one push.

Check: on any search's Pool tab, "Find people" now reports "Apollo N of M" instead of an Apollo error in its note.

## 2. Connect the sending mailboxes (2 minutes each)

lily@refery.io is already on the list with the desk's own token. For each other mailbox:

1. Go to refery.xyz/sourcing/mailboxes.
2. Press **Connect a Google mailbox**. Google shows its account picker.
3. Pick the account (lily@getrefery.com). If it is not listed, "Use another account" and sign in to it. Approve the two permissions (send email, read email). You come back to the Mailboxes page with the new address on the list.
4. On its row: set **start** (10 is right for a new mailbox), **ceiling** (50), **other** (how many emails a day that mailbox sends outside this desk; 0 for a new one), press **Save caps**, then **Test**. Test must say "Credential works".
5. For kim@getrefery.com: open a private window, sign in to refery.xyz as yourself, go to the same page, press **Connect a Google mailbox**, and on Google's screen sign in as Kim (Kim can type her own password). The token is saved on Kim's row; the desk then signs those emails as Kim.

If Google refuses with "access_denied" or "this app is only for users in the organisation": the Google project behind GOOGLE_CLIENT_ID is set to Internal for one Workspace, and getrefery.com is a different one. Two fixes, either works: move getrefery.com into the refery.io Workspace as a secondary domain (Admin console, Account, Domains, Manage domains, Add a domain), or in Google Cloud Console (APIs and Services, OAuth consent screen) switch the app to External and add the address as a test user. Tell Claude which happened and it will help.

Aliases: an alias of lily@refery.io shares its allowance; do not connect it separately.

## 3. Build and approve the profile for one search (10 minutes)

1. refery.xyz/sourcing, open **Alcor Labs · Founding Full-Stack Engineer** (its v1 is already drafted; press **Rebuild from sources** once so the newer prompt runs).
2. Read "Who they are actually looking for". If a sentence is wrong, **Edit this**, fix it, give a reason. Your edit stays on top of every later rebuild.
3. Read the requirements. Each is `must` or `prefer`; press the chip to flip it, **remove** to drop it. Only keep as `must` what would end the conversation. Things a CV cannot show (spirit, rhythm) belong in strong signals, not here.
4. Read the lookalike employers and titles. Add or remove with **Edit employers** / **Edit titles**. These drive the Apollo search, so a company that is wrong here costs credits later.
5. Read "Ask the client". Anything that matters, ask in #refery-search-questions before sourcing.
6. Press **Approve v1** (or v2 after the rebuild). The Pool tab now works.

## 4. Find and read people (15 minutes, spends credits)

1. Pool tab, press **Find people**. Free. It reads the bench (people we already know, no credit) and two pages of Apollo stubs on the employers and titles, then screens the stubs with a cheap model. The note says how many were found and how many screened out.
2. Look at the "Not read yet" filter: these are the promising stubs. Press **Read the pool (N unread)**. It asks to confirm: one Apollo credit for each person Apollo can find, up to 30 at a time. Say yes. It fetches the record, grades each person against the requirements, and runs the relationship checks.
3. Open the **Fit** filter. For each person: read the three bullets, open "Record, verdicts and the email as it would send", check the verdicts (supported / contradicted / unknown with the line they rest on) and the first email.
4. Decide: **Ready** (write to them), **Hold** (ask the client something first, or set Relocation), or **Not a fit** with a reason. The reason is stored and fed into the next profile rebuild, so write the real one ("too senior for the band", "no client-facing work").
5. Someone Apollo cannot find or you know from elsewhere: **Add a person** with name and LinkedIn URL; the next "Read the pool" resolves them.

The home page shows credits used this month against the cap (1,000 by default; change `sourcing_apollo_monthly_cap` in desk settings to move it).

## 5. Set the sequence (5 minutes, once per search)

1. Sequence tab. Read the two templates; edit the words. Merge fields in braces are filled per person; `{opener}` is the checked hook or a plain line.
2. Tick the mailboxes this search sends from. Which address: personal first (more replies) or work first.
3. Send days and window are in the seat's time zone. Follow-ups go on weekdays in working hours.
4. Leave mode on **Learning** for the pilot. **Save sequence**.
5. The preview under the editor renders it for a real person from the pool; read it once as that person would.

## 6. Write to people (2 minutes, then it runs)

1. Pool tab, **Write to N ready**. The desk freezes a batch: person, address, mailbox, the exact drafts. It posts a card to #refery-desk and lists the batch on the Pool tab under "Waiting for your approval".
2. Open the batch on the page and read the drafts (each person expands). Anyone not right: **Not a fit** or **Hold** on their row, then propose again.
3. Approve either way: **Approve and queue** on the page, or :+1: on the Slack card. `3 skip` in the Slack thread drops one line first. Whichever comes first counts; the other says "already approved".
4. First emails go out in the next window (Tuesday to Thursday morning by default), three per mailbox every ten minutes. Follow-ups go four days later in the same thread unless the person replied.

## 7. Watch (daily, 5 minutes)

- **Board** tab: where each person is; pause or stop anyone; "Open in Gmail" on every row.
- **Replies** (top of Sourcing): everything that came back. Interested and questions are also posted to #refery-desk. Answer them from Gmail; the sequence is already off for anyone who wrote.
- **Mailboxes**: sent today, replied and bounced over 30 days. A mailbox pauses itself on a failed sync or a bounce rate over 3%.
- If you ever reply to someone by hand from Gmail, the desk notices and stops their sequence.

## 8. After a week on three searches

Look at: how many found per search, how many read (credits), how many fit, how many you marked ready, replies, interested, calls booked. Then decide caps and whether to add the third mailbox. Automatic mode stays off until then.
