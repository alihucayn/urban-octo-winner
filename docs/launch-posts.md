# Ready-to-post launch copy

Replace `SITE` with your domain and `<topic>` with a real search. Run the search first and only describe what it actually shows. Name professors only positively and factually; never post a score or rank for an individual.

## Show HN (Nov 4–5 or Nov 10–12, 8–10am ET)

**Title:** Show HN: Rank PhD advisors from OpenAlex in the browser, no backend

**URL:** `SITE/?ref=hn&q=LLM%20safety`

**First comment:**

> I'm a CS undergrad applying to PhDs this cycle. Picking who to email was the slowest part: faculty pages are stale, and Google Scholar doesn't tell you who is running a lab on your topic *now*.
>
> AdvisorScout takes a topic, groups recent OpenAlex works by author, then reads each candidate's on-topic papers to estimate senior (last) author share and how many distinct first authors appear under them (a rough lab-size signal). Score: volume 40, senior-author share 25, h-index 15, lab size 10, recency 10. Consortium papers (50+ authors) are excluded from the role signals.
>
> It is a static site: the browser calls OpenAlex directly, with an optional Cloudflare Worker cache. No sign-up; the top 5 results are free. A $12 one-time Pro unlocks all results, CSV and cold-email starters.
>
> Known weak spots: fields with alphabetical author order (maths, theory, econ), OpenAlex author merges and stale affiliations. Happy to hear how you'd validate the ranking.

## Indie Hackers (week after HN)

**Title:** Building a $12 tool for PhD applicants from Pakistan, with no Stripe and no backend

> Stack: static HTML/JS on GitHub Pages, OpenAlex for data, Lemon Squeezy as merchant of record (Stripe/PayPal don't pay out to Pakistan), license keys checked in the browser. Running cost: a domain.
> Numbers so far: [visitors] visitors, [searches] searches, [sales] sales. Biggest lesson: [one honest lesson].
> Link: `SITE/?ref=ih`

## r/SideProject (disclosed maker post; check the rules first)

**Title:** I built a free tool that shows which professors are publishing on your PhD topic right now

> Maker here. Type a research topic, get professors ranked by recent on-topic papers and lab-head signals (last-author share, distinct first authors). Top 5 free, no sign-up. I'm applying to PhDs myself and built it for my own shortlist. Feedback welcome, especially from non-CS fields. `SITE/?ref=sideproject`

## Reddit answers where promotion is banned (r/PhD, r/gradadmissions)

No link, no product name, no "DM me". Just the method:

> What worked for me: search your topic on OpenAlex or Semantic Scholar, filter to the last 2–3 years, and look for people who are repeatedly the **last** author (usually the lab head in CS/bio). Then check how many different first authors appear on those papers; that tells you if there's an active lab. Early-career faculty with a few last-author papers are often the most likely to reply. Open one paper they led and write one specific sentence about it in your first paragraph.

## LinkedIn / X: Topic Radar (weekly)

> Applying for a PhD in **<topic>** this cycle? I looked at who has been publishing on it most actively since 2024.
>
> 5 labs worth knowing:
> 1. Prof. <Name> (<University>): recent work on <one-line theme>
> 2. …
>
> Before you email anyone: open one paper they *led* (first or last author) and say one specific thing about it in your first two lines.
>
> Top 5 for any topic, free, no sign-up: `SITE/?utm_source=linkedin&q=<topic>`

## LinkedIn / X: Rising PIs (weekly)

> Early-career faculty are often the ones actively recruiting PhD students, and the most likely to reply to a good cold email.
>
> A few rising PIs publishing on **<topic>** right now: <Name> (<University>), <Name> (<University>), <Name> (<University>).
>
> Find them for your own topic: `SITE/?utm_source=x&q=<topic>`

## WhatsApp / Facebook groups (after the admin says yes)

**Message to the admin:**

> Assalam o Alaikum / Hi [name], I'm a NUST CS student applying to PhDs this cycle. I built a free tool that lists professors actively publishing on any research topic. Would it be OK to share it in [group]? Happy to give you a free Pro key and a [30]% code for members.

**Group post** (with a screenshot of the free top 5 for a popular topic):

> PhD applicants: who is *actually* publishing on <topic> right now? Here are the top 5 from a free tool I built (no sign-up). Try your own topic: `SITE/?ref=pk-wa-<group>&q=<topic>`
> Members get [30]% off Pro with code **<GROUP>**. Card not working? JazzCash/Easypaisa is accepted too.

## Kit broadcasts (send by hand)

**~Nov 20: "3 weeks to Dec 1: who to email this week"**
> Most US PhD deadlines are Dec 1 and Dec 15. If you haven't emailed potential advisors yet, this week is the time. Checklist: SITE/guide.html. Find who's active on your topic: SITE/?utm_source=kit. Code **KITNOV** gives 25% off Pro until Nov 27.

**~Nov 28: "Dec 1 deadlines: last week to email"**
> Short and specific beats long and polite. One sentence about a paper they led, one about your result, one direct question. Follow up once after 10–14 days. SITE/?utm_source=kit

**~Dec 10: "Dec 15: final push + follow-ups"**
> Follow up with anyone you emailed before Nov 30. One line, same thread. If you need every match and CSV for your tracker, code **KITDEC** gives 25% off until Dec 15. SITE/?utm_source=kit

Create each code in Lemon Squeezy with an end date before sending.
