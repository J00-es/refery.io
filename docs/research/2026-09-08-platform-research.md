# Candidate delivery, partner marketplaces, candidate experience and operator automation in 2026: what the market does, and what it means for Refery

Research run 8 September 2026, about 85 pages consulted. Companion to `2026-09-07-founder-brief-research.md`, which covered how AI-native players brief founders. Every claim carries a source number from the list at the end. Vendor marketing claims are marked as such.

## The one-paragraph read

Every AI-native player ships the hiring manager's decision to Slack and fuses scheduling to the approve click: Perfectly sends the calendar link on approval, Wellfound schedules and sends the rejections, Contrario syncs to the ATS with a scorecard. Decision speed is now a tracked client metric (Candidately reports "time to view" and "client response time"; Reflik publishes 2 to 3 business days as the norm). The "no" always carries a reason, and the reason goes to the partner, never the candidate. Ownership windows are 6 to 12 months and company-scoped, arbitrated by consent plus timestamp; Refery's 24 months is well above market. Partner economics on the AI networks are 50 to 80% of the fee, paid 30 to 90 days after start; Refery's 30-days-after-start client terms are at the fast end. The candidate seat is where everyone is weakest: 61% of candidates report being ghosted after an interview and 42% quit over slow scheduling, so the calendar link on approval is worth more than any card polish.

## 1. Players by seat

| Player | Hiring manager seat | Partner seat | Candidate seat | Operator seat | Sources |
|---|---|---|---|---|---|
| Paraform | Client dashboard with chat to the recruiter; HM rates each candidate 1 to 4; HM schedules directly; submission blocked if already submitted or applied directly | Candidate CRM with statuses; approval per role; max 3 pending applications; capped primary recruiters per role; rating = interview rate plus HM score, 50%+ interview rate for top roles; ownership 12 months, company-scoped, to whoever got explicit consent; 45-day contacted-recently lock; payout 30/60/90 days after start; 6-month non-solicit | Consent required before submission; recruiter preps and checks in | 9-step client onboarding; listing fee plus success fee | 1 to 9 |
| Contrario | Candidates in the company Slack with AI scorecards, synced to Ashby or Lever; Calendly; claims 80% first-round interview rate (marketing) | Matched by placement history; 50 to 70% split (third-party analysis); $1M+ paid in under six months | Not documented | Intake call plus upload; ~20 to 25% fee, hybrid subscription | 34 to 37 |
| Perfectly (YC W26) | Slack agent drops interview-ready candidates; on approval sends the HM's calendar link | In-house | Calendar link on approval | Contingency only | 38, 39 |
| Standout (YC) | Founder gets one message: who, why they fit, why now; meeting booked by the agent | In-house | Anonymous until they greenlight a role; free for talent | Pay on hire, no retainer, no exclusivity | 40 |
| Dover | Slack per job, per-stage notifications, daily approve or reject, weekly funnel email per job | 50+ fractional recruiters | Candidate portal, per-stage visibility opt-in | Free ATS; recommends written ownership terms (6 to 12 months) and a definition of "introduction" | 10 to 13 |
| Wellfound Autopilot | One-click approve; Wellfound schedules and sends rejections; Slack review | In-house | Rejections sent on the HM's behalf | Daily improvements from feedback | 41, 42 |
| Juicebox | HM seats approve or reject with notes; Slack posts leads, "Approve or pass" | Shortlist reviews with anyone in the org | Not documented | Agent 4.0 | 43 to 45 |
| Loxo | HM portal: kanban, submission summary, comp, resume, feedback as No/Maybe/Yes or scorecard; recruiter chooses what the client sees | Not applicable | Not applicable | Submittal agent writes "why this person, this role, right now"; status-report template incl. SLA compliance and "why no candidates have met the criteria" | 14 to 17 |
| Recruiterflow | Client portal: thumbs up moves stage, thumbs down disqualifies with a reason; last name, email, phone, LinkedIn can be hidden | Not applicable | Not applicable | Submission agent writes 3 to 5 fit signals in the recruiter's tone; 40%+ of submissions use it | 31 to 33 |
| Bullhorn + Candidately, 3DIQ | No-login submission links; thumbs up or down; client analytics: time to view, submittal-to-interview, client response time ("5 days to same day") | Not applicable | "You have been submitted to [job] with [company]" email | Automation on submission status | 26 to 29, 81 |
| Ashby | Candidate reviews with a required 1 to 4 score, Slack and email notifications; AI notes lift scorecard completion | Agency portal: agencies see stage, own notes, hiring team; cannot email, schedule or move stage; feedback visibility toggled by admin | No candidate portal | Benchmarks (below) | 18 to 21, 88 |
| Greenhouse | Slack notifications incl. agency submissions and scorecard reminders one hour after interview | Agencies see current and next stage plus feedback; "rejection notes to agency" never reach the candidate; no auto-merge of agency submissions because credit is contested | 61% ghosted after interview (survey) | Relode marketplace sync | 22 to 24, 63, 85, 86 |
| Reflik | Reviews resumes in 2 to 3 business days | 180-day ownership per job for the first to submit; candidate must accept a right-to-represent email; recruiter sees fee and others' submission counts; paid 60 days after start; 60-day replacement guarantee | Right-to-represent consent | Account managers | 47 |
| BountyJobs | Employer responsiveness shown to agencies | 6-month ownership; duplicates blocked, first timestamp wins; earnings pending until collection plus 60 days; 90-day guarantee for fees of 20%+ | Not applicable | One master agreement | 48, 49 |
| Mercor, micro1, Alex, HireVue | Prequalified candidates with instant offers (Mercor) | Not applicable | 20-minute AI interview, 3 retakes (Mercor); structured feedback on request, taken up by 10.7% (micro1); 79% of candidates want to be told when AI is used (HireVue); documented failures at scale (Alex) | Not applicable | 53 to 59 |
| Teamable, Metaview | Referral messages in Slack update in place after a decision | Employees refer inside Slack | Not applicable | Auto-filled scorecards with evidence | 46, 79, 80 |

## 2. The best-in-class delivery spec, synthesised

**Slack card.** Role, candidate name (only after ownership and consent clear), current title and company, location, years; 3 to 5 fit signals against the brief's must-haves; one evidence quote from the screen; comp expectation and availability; links to LinkedIn, CV and the brief; submitted by and when (the ownership clock); a duplicate or ownership flag where relevant. Buttons: Interview (sends the calendar link in the same action), Not a fit (opens a reason picker; reason goes to the partner, not the candidate), Ask a question (thread to Lily or the partner), Later. The message edits in place after a decision; one reminder if nothing happens.

**Email.** Subject `[Refery] Client | Candidate for Role`; one line of context (new, awaiting you, oldest waiting); per candidate the same fields; two buttons deep-linking to the private page with no login; a footer saying what is needed by when (2 to 3 business days is the published norm).

**Portal page.** Columns: candidate, submitted by, submitted on, stage, days waiting for you, fit signals, comp, decision. States: New, Interview requested, Scheduled, In process, Offer, Hired, Declined with reason, Withdrawn. Actions: Interview, Not a fit with reason, Ask, download PDF, resume versus summary toggle. Operator controls: hide last name, email, phone and LinkedIn until interview; link expiry; sections shown. Silent metrics: time to view, client response time, submittal-to-interview.

## 3. Twenty insights, each with the "so what"

1. Every AI-native player ships the decision to Slack and fuses scheduling to approve (Perfectly, Wellfound, Contrario). Refery's Interview button should send the calendar link in the same action. [34, 38, 42]
2. Decision speed is a tracked client metric (Candidately, Reflik, Ashby NPS 9 within a day versus 3 at 50+ days). Show "days waiting for you" on the page and in the Monday email. [20, 26, 27, 47]
3. Reasons are captured at the moment of "no" and go to the partner, never the candidate (Recruiterflow, Greenhouse). Make the reason a required picker and route it to the partner desk and #refery-desk. [23, 31]
4. Paraform turns the HM's 1 to 4 rating into the recruiter's economics and role access. One score per card gives Refery a partner quality signal for free. [7, 8]
5. Ownership is company-scoped, 6 to 12 months, consent plus timestamp, and the platform arbitrates (Paraform 12, BountyJobs 6, Reflik 180 days). Refery's 24 months is far above market; justify it in the terms or expect disputes; publish the tie-break. [2, 13, 47, 48]
6. Duplicate detection at submit is table stakes and nobody auto-merges agency submissions (Paraform, BountyJobs, Greenhouse). Check against the company's own applicants and other partners before the card reaches the HM. [4, 48, 86]
7. Candidate consent is a submission-time artefact (Reflik's right-to-represent email, Paraform's consent tie-break, Standout's greenlight). One consent link per submission covers consent, ownership and GDPR evidence. [2, 40, 47]
8. Agency portals show partners the stage and sanitised feedback, not the HM's private notes (Greenhouse, Ashby). Keep HM notes internal by default. [19, 23, 88]
9. Payout timing is start date plus a guarantee window everywhere (Paraform 30/60/90, Reflik 60, BountyJobs 60). Refery's 30 days after start is the fast end; say so and hold a replacement reserve. [4, 47, 48, 70]
10. Fee splits on the AI networks are 50 to 80% to the recruiter, and they publish leaderboards and top-earner figures. Publish the split and a top-partners signal. [35 to 37]
11. Slack Connect with agencies cuts email by 80% and approvals by 50% (Slack's numbers); public channels leak private fields. One private channel per client, PII in the portal, names plus links in Slack. [22, 75]
12. The weekly client status report has a known shape: stage, interviews done and booked with outcomes, client actions with dates, SLA compliance, shortlist, and "why the market is thin" (Loxo, Dover). Add "what you owe us" to the Monday email. [11, 17]
13. Ghosting is measured and the HM is the bottleneck: 61% of candidates ghosted after interview, 81% of HMs admit it, "waiting on HM sign-off" is the top stall. Nag the HM, not just the candidate, and auto-close after a defined silence. [63]
14. Scheduling delay is where candidates quit: 42% leave, 62% judge the employer on it, only 9% get a first interview within a day. [65]
15. Candidates want to know when AI is used (79%) and want a human in the loop (HireVue, Mercor). If AI summaries are on the card, say so in the consent step. [53, 58]
16. Feedback to rejected candidates is rare even when offered (10.7% take-up, 4.37/5 rating for the offer). An "ask for feedback" link in the decline costs little. [55]
17. Confidential searches are communicated as sector plus stage plus role, name withheld until vetting. The brief needs a confidential mode that hides the name until Interview. [60, 61]
18. AI submittal writers converge on 3 to 5 fit signals in the recruiter's voice, editable (Recruiterflow, Loxo). Draft it for partners from their notes, keep their name on it. [16, 32]
19. Marketplaces cap concurrency to protect quality (Paraform: 3 pending, capped primary recruiters). Search assignments should carry a cap and a partner's open count should gate proposals. [5]
20. A reusable talent pool is a product (micro1; Gem: sourced hires from existing databases rose from 29% to 44%). Bench re-match is right; the first consent must cover future roles. [55, 67]

## 4. What a founder-run network commonly forgets

Duplicate submissions and the tie-break; "effective cause" disputes that arrive after the offer; candidate consent evidence; the GDPR one-month notice for sourced candidates; a published HM response SLA; reason-coded rejection; the offer-stage handoff (22% of accepted offers no-show on day one industry-wide); guarantee tracking (90 days modal, 61% replacement-only, under 8% invoked); payout reserves; HM ghosting; scheduling latency; non-solicitation of client staff; confidentiality of client feedback; PII in Slack; concurrency caps; partner quality scoring; AI transparency; candidate status transparency; archiving the channel when a role fills. Sources: 2, 3, 5, 7, 13, 18, 22, 23, 31, 47, 48, 49, 58, 59, 62, 63, 65, 70, 71, 76, 77, 86.

## 5. Data points

| Metric | Value | Source |
|---|---|---|
| Ownership window | Paraform 12 months company-scoped; BountyJobs 6 months; Reflik 180 days; contracts 6 to 12 months | 2, 13, 47, 48, 70 |
| Payout timing | Paraform 30/60/90 after start; Reflik 60; BountyJobs after 60 days of employment | 4, 47, 48 |
| Client payment terms | Net-30 from start standard; net-10 buys 1 to 3 points off the fee | 70 |
| Contingency fee | 15 to 25% typical; 18 to 25% senior startup roles; Contrario ~20 to 25% | 37, 70 to 72 |
| Recruiter split | Contrario 50 to 70%; Paraform ~80% (third-party) | 37 |
| Guarantee | 90 days modal; 61.4% replacement-only; under 8% invoked at one agency | 70, 71 |
| HM feedback window | Reflik 2 to 3 business days; Candidately "5 days to same day" | 26, 47 |
| Interview-rate targets | Paraform 60% first round, 30% mid; 50%+ for top roles | 7, 8 |
| Submittal-to-interview | 3:1 to 5:1 healthy for agencies | 73 |
| Pass rates (Ashby) | Recruiter screen 35% (52% referred); onsite 24% (36% referred); offer 81% | 20 |
| Time to fill (Ashby) | 71 days senior, 63 mid, 52 junior | 20 |
| Scheduling | 3.7 h automated vs 5 h manual (Ashby); 42% of candidates quit over delay; 9% scheduled within a day | 20, 65 |
| Ghosting | 61% after interview; 81% of HMs admit it; 72% of conversations stall 30+ days, median silence 75 days | 63 |
| AI transparency | 79% of candidates want to be told | 58 |
| Slack Connect with agencies | 80% fewer emails, 50% faster approvals (Slack) | 75 |
| Staffing firms (GRID 2026) | 56% of highest-growth firms place in under 10 days; only 10% have agentic AI across the workflow | 68 |

## 6. Refery against the market, in one table

| Term | Refery today | Market | Read |
|---|---|---|---|
| Client fee | 10% (15% Arx) | 15 to 25% | Deliberately low; state it as the pitch, keep it |
| Guarantee | 90-day replacement | 60 to 90 days, replacement-only in 61% | In line |
| Client payment | 30 days after start (v2.8) | Net-30 from start | In line |
| Partner share | 70% of the fee | 50 to 80% | In line; publish it |
| Partner payout gate | Day 90 plus client paid, 14 business days | Start plus 30 to 90 days | Slower than Paraform's first instalment; consider 30/60/90 instalments |
| Candidate ownership | 24 months, all roles at the client | 6 to 12 months, company-scoped | Far above market; justify or shorten |
| Client protection | 12 months | 6 to 12 months | In line |
| HM response SLA | None published | 2 to 3 business days | Publish one and show "waiting since" |
| Consent evidence | Attestation sentence on submit | Right-to-represent email, consent tie-break | Add a candidate consent link |
| Concurrency cap | None | 3 pending, capped primaries | Add per-search cap |

## Sources

1. https://knowledge.paraform.com/articles/9331582412-candidates-dashboard
2. https://knowledge.paraform.com/articles/5997859648-candidate-ownership
3. https://knowledge.paraform.com/articles/9893304248-paraform-platform-ground-rules
4. https://knowledge.paraform.com/articles/8556979815-faq
5. https://knowledge.paraform.com/articles/5446967618-approvals
6. https://knowledge.paraform.com/articles/7550953773-client-onboarding
7. https://knowledge.paraform.com/articles/3403567466-recruiter-rating
8. https://www.paraform.com/help/article/FAQ-recruiter-profile
9. https://techcrunch.com/2024/04/15/paraform-a-recruiting-platform-that-connects-recruiters-and-startups-raises-funding
10. https://www.dover.com/blog/product-update-february-2026
11. https://help.dover.com/en/articles/6228853-notifications
12. https://help.dover.com/en/articles/13933588-candidate-portal
13. https://www.dover.com/blog/what-happens-multiple-recruiters-same-role
14. https://help.loxo.co/en/articles/11049207-using-loxo-s-hiring-manager-portal
15. https://help.loxo.co/en/articles/8149140-share-candidates
16. https://www.loxo.co/ai-agents/candidate-submittals-agent
17. https://www.loxo.co/blog/how-to-use-recruiting-status-reports-2038f3d0a231
18. https://docs.ashbyhq.com/candidate-reviews
19. https://docs.ashbyhq.com/agencies-setup
20. https://www.ashbyhq.com/talent-trends-report/reports/recruiting-operations-benchmarks-talent-trends
21. https://docs.ashbyhq.com/ai-notetaker
22. https://support.greenhouse.io/hc/en-us/articles/207344866-Slack-integration
23. https://support.greenhouse.io/hc/en-us/articles/360003489591-Best-practices-Get-the-most-from-the-Greenhouse-Agency-Portal
24. https://support.greenhouse.io/hc/en-us/articles/360047691292-Configure-a-scorecard-reminder-notification
25. https://help.lever.co/hc/en-us/articles/360015483171-How-do-I-manage-the-agency-candidates-submitted-to-my-pipeline-in-Lever-
26. https://www.candidately.com/bullhorn
27. https://www.bullhorn.com/marketplace/candidately/
28. https://3diq.com/submission-platform/
29. https://www.bullhorn.com/connected-recruiting/product-playbooks/candidate-submittal-notification/
30. https://help.crelate.com/en/articles/4120342-client-portal-workflow
31. https://help.recruiterflow.com/en/articles/2038962-how-to-share-candidates-with-clients-using-the-client-portal
32. https://recruiterflow.com/blog/recruiterflow-product-update-june24-2/
33. https://help.recruiterflow.com/en/articles/11686348-how-to-hide-or-show-candidates-in-the-job-pipeline-of-the-client-portal
34. https://www.ycombinator.com/launches/MwN-contrario-the-1st-ai-powered-recruiting-network
35. https://venturebeat.com/business/contrario-launches-the-case-for-pairing-ai-agents-with-human-recruiters-instead-of-replacing-them
36. https://www.prnewswire.com/news-releases/contrario-launches-after-reaching-6m-annualized-revenue-and-paying-1m-to-recruiters-in-under-six-months-302777172.html
37. https://www.herohunt.ai/blog/contrario-pricing-alternatives-2026/
38. https://www.ycombinator.com/launches/PEe-hire-with-perfectly-your-ai-recruiting-agency
39. https://www.producthunt.com/products/perfectly
40. https://www.ycombinator.com/launches/QEL-standout-the-agentic-hiring-marketplace
41. https://help.wellfound.com/article/1094-how-do-i-use-autopilot
42. https://wellfound.com/recruit/all-features/autopilot
43. https://juicebox.ai/blog/email-analytics-hiring-manager-reviews
44. https://juicebox.ai/blog/introducing-juicebox-for-slack
45. https://docs.juicebox.work/hiring-manager-seats
46. https://support.teamable.com/collection/334-referrals
47. https://www.reflik.com/faqs-recruiters
48. https://bountyjobs.com/recruiter-faq-0
49. https://blog.bountyjobs.com/headhunter_contract_terms_
50. https://www.goscoutgo.com/for-search-firms/how-it-works/
51. https://help.recruitifi.com/en/articles/2279328-recruiter-payouts-terms-timing-and-setup (gated)
52. https://makerstack.co/reviews/hired-review/
53. https://talent.docs.mercor.com/support/ai-interview
54. https://talent.docs.mercor.com/new-releases/instant-offer
55. https://arxiv.org/html/2507.02869v1
56. https://recruitingtechreviews.com/articles/alex-ai-recruiter-reviews
57. https://www.herohunt.ai/blog/alex-apriora-pricing-alternatives-2026/
58. https://www.hirevue.com/blog/hiring/candidates-think-about-ai-hiring-2025
59. https://www.hirevue.com/resources/report/2025-candidate-experience-report
60. https://www.goodwinrecruiting.com/blog/why-companies-post-confidential-jobs-and-how-to-respond
61. https://ess123.com/confidential-job-searches-stealth-search-guide/
62. https://blog.theinterviewguys.com/the-2025-ghosting-index/
63. https://www.pin.com/blog/employer-ghosting-index/
64. https://www.ihire.com/resourcecenter/employer/pages/53-percent-of-job-seekers-have-been-ghosted-by-a-potential-employer
65. https://www.cronofy.com/reports/candidate-expectations-report-2024
66. https://www.pin.com/blog/recruitment-funnel-benchmarks/
67. https://www.gem.com/blog/10-takeaways-from-the-2025-recruiting-benchmarks-report
68. https://www.globenewswire.com/news-release/2026/02/25/3244739/0/en/bullhorn-grid-report-staffing-firms-using-ai-see-stronger-growth-faster-placements.html
69. https://www.bullhorn.com/grid/2025-industry-trends/
70. https://www.pin.com/blog/negotiate-recruiter-fees/
71. https://www.thetechrecruiters.com/signal/startup-recruiting-101/what-is-a-90-day-hiring-guarantee-and-which-agencies-offer-it/
72. https://www.paraform.com/blog/contingency-recruiting-guide
73. https://www.recrew.ai/glossary/submittal-to-interview-ratio
74. https://www.carv.com/blog/staffing-industry-benchmarks
75. https://slack.com/resources/using-slack/slack-connect-marketing
76. https://slack.com/resources/using-slack/the-recruiting-mini-guide
77. https://resources.workable.com/tutorial/how-to-approach-gdpr-legitimate-interest-in-recruiting
78. https://gdprlocal.com/how-gdpr-affects-staffing-and-recruiting/
79. https://www.metaview.ai/intake-debrief-notes
80. https://www.metaview.ai/resources/blog/create-effective-interview-scorecards
81. https://kb.bullhorn.com/automation/Content/Automation/Topics/SubmissionEntity.htm
82. https://help.crelate.com/en/articles/4120486-creating-your-workflow-stages
83. https://www.trychaser.com/blog/agency-client-onboarding
84. https://reqbrief.com/blog/client-onboarding-checklist-for-agencies
85. https://support.greenhouse.io/hc/en-us/articles/4420540879515-Relode
86. https://support.greenhouse.io/hc/en-us/articles/208063316-Auto-merge
87. https://www.dover.com/blog/paraform-reviews-pricing-alternatives
88. https://docs.ashbyhq.com/agency-users-and-external-recruiters

Reliability notes: Lever's agency page and RecruitiFi's payout page returned 401, so their facts come from search summaries. Contrario's 80% interview rate and 90-day guarantee, and Perfectly's multiples, are vendor claims. Paraform's "70% interviewed" appeared only in a search summary.
