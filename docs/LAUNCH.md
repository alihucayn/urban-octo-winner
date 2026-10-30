# AdvisorScout: business plan and launch checklist

Goal: **$100–500/month on average**, which for a one-time seasonal product means about **$1,200–6,000 a year, mostly earned September–January**. Low running cost, little maintenance.

## 1. Research summary: why this and not something else

| Option researched | Verdict |
|---|---|
| **Apify Store actors** (scrapers sold per run) | Distribution is built in and Apify pays out monthly, but every obvious niche is saturated. Searches turned up 15+ near-identical "Greenhouse/Lever/Ashby jobs" actors, 15+ Shopify scrapers at about $1 per 1,000 results, and 6+ "website audit lead" actors. Rental pricing is being retired in favour of pay-per-event, and Apify deducts platform compute from payouts. PayPal is unavailable in Pakistan, so payouts need a $100 minimum via wire. **Rejected: a race to the bottom on price.** |
| Generic micro-SaaS ($9–29/mo B2B tools) | Workable, but needs a market you understand plus months of marketing to reach about 30 customers. |
| Templates on Gumroad | Easy to copy, low price, and discovery is hard. |
| **Niche tool for PhD applicants** ✅ | You know this market from the inside. Demand is seasonal but large and recurring: hundreds of thousands of international applicants each year, with peak season from **September to December, which is now**. Competitors (SupervisorMatch, ApexApply, UniversityCube) exist, which shows demand, but none offer a cheap "who is actively publishing on X and runs a lab" ranking. Data is free (OpenAlex, CC0), hosting is free (static site), and there is nothing to maintain server-side. |

### Unit economics (recheck fees before publishing numbers)

Fees from docs.lemonsqueezy.com/help/getting-started/fees: 5% + $0.50, plus 1.5% for non-US buyers, plus 1% on payouts to a non-US bank. Recheck them (and the affiliate fee) before launch.

| Sale | Gross | Net to a Pakistani bank |
|---|---|---|
| Card, non-US buyer, list price | $12 | $12 − 5% − $0.50 − 1.5% = $10.72, − 1% payout ≈ **$10.60** |
| 15% channel code | $10.20 | ≈ $8.95 |
| 50% NUST society code | $6 | ≈ $5.05 (keep this one rare) |
| JazzCash/Easypaisa PKR 2,000 | ≈ $7 | ≈ $7, no fees, but your time |

Plan on a blended **≈ $9 per sale**. The price is `CONFIG.price` in `src/config.js`; redo this table if you change it.

**Conversion.** Freemium tools typically convert **0.3–1.5% of visitors** to paid, not 2–3%. Visitors needed per month (at $9/sale):

| Visitor → buyer | $100/mo (≈ 11 sales) | $300/mo (≈ 34 sales) | $500/mo (≈ 56 sales) |
|---|---|---|---|
| 0.5% | 2,200 | 6,800 | 11,200 |
| 1% | 1,100 | 3,400 | 5,600 |
| 1.5% | 730 | 2,300 | 3,700 |

**Season target:** 60–100 sales by Dec 15, 2026 (≈ $540–900). Off-season months will be near zero; judge the year, not a month.

**Costs:** $0 hosting (GitHub Pages, free Cloudflare Worker). Domain ≈ $10/yr. OpenAlex (below) is a few dollars a month at most if the proxy cache works.

**OpenAlex cost model (2026 usage pricing; verify on developers.openalex.org and help.openalex.org/access/pricing).** A call with `search`/`.search` costs about $0.001, a plain list/filter call about $0.0001. One AdvisorScout search makes ~9–17 search-filtered calls plus 2–4 list calls, so **≈ $0.01–0.02 per search** uncached. Keyless budget is roughly $0.01–0.10/day per IP (≈ 1–10 searches; campus NAT and mobile CGNAT put many people on one IP). A free key gives $1/day (≈ 50–100 searches). Both reset at 00:00 UTC (05:00 PKT). This is why the app uses each visitor's own keyless allowance first and only falls back to your proxy; the cost *does* grow with users, but only for proxy traffic, and the 24h cache absorbs repeat topics. If proxy traffic outgrows $1/day, buy prepaid OpenAlex credit (a few dollars a month at the $500/mo target).

### Risks (be honest with yourself)

- **Seasonality.** Expect most sales from September to January. In the off-season, sell to Master's applicants and postdoc seekers, or add the yearly-pass upsell in section 5.
- **Client-side paywall = honor system.** The unlock lives in the browser, so anyone with devtools can bypass it. That is acceptable at $12. Sell convenience, not DRM. Move license validation into the Worker only if a public bypass circulates.
- **Payment platform risk.** Export customers and license keys from Lemon Squeezy (and Gumroad) on the 1st of every month.
- **OpenAlex limits.** Never put an API key in `src/config.js`: it is public, every visitor would drain the same $1/day, and the key is also your openalex.org sign-in. `mailto` no longer raises limits. The key lives only as a Worker secret (section 3, step 4). Before launch, call `GET https://api.openalex.org/rate-limit?api_key=…`, confirm current per-call prices and whether keyless budgets are per IP on https://developers.openalex.org. When a free visitor's network budget runs out (and the proxy is also exhausted), the app says it resets at 00:00 UTC (05:00 PKT) and offers Pro, which uses your quota.
- **Data quality.** OpenAlex sometimes merges or splits authors, and affiliations can be stale. The UI tells users to verify. Keep it that way.

## 2. Payments: set up first (about 1 hour, before any marketing)

PayPal and Stripe don't pay out to Pakistan, so use a merchant of record. Nothing here is officially confirmed for Pakistan, so verify inside each dashboard.

| Provider | Pakistan payouts | Source | Last verified |
|---|---|---|---|
| **Lemon Squeezy** (primary) | Third-party reports say yes (bank, $50 min); unconfirmed officially. Moving to Stripe Managed Payments, and Stripe does not onboard Pakistani merchants, so watch for changes. | Third-party reviews | 2026-10 |
| **Gumroad** (backup) | Unclear: payouts run through Stripe Connect and reports conflict. Verify in payout settings. | Mixed reports | 2026-10 |
| **Dodo Payments** | Official docs restrict merchant KYC/payouts to listed countries, while its English marketing blog claims Pakistan works. Treat as unavailable until signup KYC accepts a Pakistani CNIC. | Dodo docs vs blog | 2026-10 |

**Step 0 (hard gate):** create the Lemon Squeezy account, finish identity checks, and confirm a Pakistani bank account can be saved under **Settings → Payouts**. Open a Gumroad account as backup. Do not post anywhere until this works.

1. **Lemon Squeezy:**
   - Create a product "AdvisorScout Pro", price $12, single payment.
   - Enable **License keys** on the product (activation limit **5**, never expires). Users can free a slot with "Deactivate on this device".
   - Copy the checkout link into `checkoutUrl` in `src/config.js`, your brand into `sellerName`, and your address into `supportEmail` (footer, legal pages, failed activations).
   - **Match the page copy:** the site promises a `refundDays`-day money-back guarantee (default 14), "works on `activationLimit` devices" (default 5) and "never expires". Put the same refund policy in the store settings and the product description, and refund promptly; a visible policy cuts chargebacks, which get merchant accounts closed.
   - Turn on **Affiliates** (Store → Affiliates) at 30%, and put your store slug in `lsStoreSlug`. The app then loads Lemon Squeezy's `affiliate.js`, which credits `?aff=` links. Don't build `aff` links by hand.
   - **Required:** set `lemonStoreId` (Settings → Stores, the number shown after `#`) and `lemonProductId` (Products → ⋯ → Copy ID). Without both, every key is rejected; with them, keys from other stores (including free $0 products) are refused.
   - The deploy workflow runs `scripts/check-config.mjs` and refuses to publish while `checkoutUrl` is a placeholder, the provider is `none`, or the IDs are missing.
   - [ ] **Legal pages and support email live:** `terms.html`, `privacy.html`, `refund.html` deployed, `sellerName` and `supportEmail` set. Lemon Squeezy reviews the site before activating the store.
   - [ ] Then apply to **activate the store**.
2. **Gumroad backup:** set `licenseProvider: 'gumroad'` and `gumroadProductId`. The app caps each key at `activationLimit` activations.
3. **Mandatory:** make a test-mode purchase and activate the key on the deployed GitHub Pages URL. This is the only way to confirm the provider allows the browser (CORS) call. If it is blocked, route the license call through the Worker too. In the same test, open `/?ref=test&code=<TESTCODE>&aff=<affiliate id>`, buy, and confirm the order shows the discount, the affiliate credit and `custom.source = test`. Also place one **$0 order with a 100%-off code** and confirm it issues a working key (the local-payment flow depends on it).

### Buyers whose cards fail (Pakistan, India, Nigeria, Egypt)

Many local cards are blocked for international or USD payments. Two fixes:

- **Local payment fallback.** Set `localPay.whatsapp` (digits with country code). The Pro dialog then offers "Pay PKR 2,000 by JazzCash/Easypaisa, message me on WhatsApp" plus a tip to enable international/e-commerce payments in the bank app. For each manual buyer: confirm the transfer, create a **single-use 100%-off discount code** in Lemon Squeezy, and send them the checkout link with `?code=THATCODE` (or place the $0 order yourself with their email). Lemon Squeezy then emails a real license key, which the app accepts as normal. Note the payer and amount in a sheet for your own tax records.
- **Regional price (optional experiment).** `regionalOffers` matches the browser's time zone and pre-fills a discount code. Use a modest cut ($8–9), give the code a redemption limit or end date, run it 2–3 weeks, and compare **revenue per visitor** with the weeks before. Drop it if that falls. Leave it empty by default.

**Iran is reach-only.** Lemon Squeezy and Gumroad are US merchants of record bound by OFAC sanctions, and Iranian cards can't pay abroad anyway. Iranian Telegram groups are free-tier channels for reach and word of mouth, not sales.

## 3. Deploy (about 15 minutes)

1. Merge this branch into `main`.
2. Go to GitHub, then **Settings → Pages → Source: GitHub Actions**. The included workflow runs the tests and deploys on every push to `main`.
3. **Buy the domain before the first public post** (about $10/yr), so every shared link card points at the final URL. Set it in **Settings → Pages → Custom domain** (the workflow uses `actions/deploy-pages`, so don't add a CNAME file). Then replace `https://alihucayn.github.io/urban-octo-winner/` with your domain in: `index.html` (canonical, `og:url`, `og:image`, `twitter:image`), `guide.html`, `robots.txt` and `sitemap.xml`. Social crawlers don't run JS, so these must be static.
   - Check the card in the LinkedIn Post Inspector and the Facebook Sharing Debugger, send yourself the link on WhatsApp, and submit the domain to Google Search Console with the sitemap.
   - `assets/og.png` is a generic card. Once the app is live, a real screenshot of ranked results (1200×630, under 300KB) converts better.
   - Optional: run `node scripts/make-sample.mjs "LLM safety"` on your machine and commit `src/sample.json`; the landing page then shows 3 real result cards before anyone searches. Re-run monthly.
4. **OpenAlex proxy (strongly recommended, ~15 min, free):** get a free OpenAlex key, then `npx wrangler deploy worker/openalex-proxy.js --name advisorscout-api`, `npx wrangler secret put OPENALEX_KEY` (the key exists **only** as this Worker secret), set the `ALLOWED_ORIGIN` (your Pages URL) and `MAILTO` vars, and set `openalex.proxy` in `src/config.js` to the Worker URL. Leave `openalex.base` as `https://api.openalex.org` and `openalex.apiKey` empty (CI fails if it is set). Free visitors then search on their own allowance and fall back to the Worker on a 429; Pro always uses the Worker, so Pro keeps working when a campus IP is exhausted.
5. **Analytics (free):** create a site on Umami Cloud (Hobby) and put its Website ID in `analytics.siteId`. Nothing is sent until you do, and visitors with Global Privacy Control are skipped.
6. **Email list (free, optional but valuable):** create a Kit (kit.com) form with double opt-in, and put its action URL (`https://app.kit.com/forms/<id>/subscriptions`) in `emailCapture.action`. A sign-up card then appears under search results. Set `topicField: true` only after creating a custom field named `topic` in Kit. The ungated checklist lives at `guide.html`. Confirm the current free-plan limits on kit.com first.

## 4. Launch calendar (Nov 2 – Dec 15, 2026)

Most US deadlines are **Dec 1 and Dec 15**, so the window is now. Ready-to-post text is in [launch-posts.md](launch-posts.md). Spend 30–45 minutes a day.

**Rules that keep you un-banned:** read each subreddit's current rules before posting, and modmail first before any post that names the product. Where self-promotion is banned (r/PhD; r/gradadmissions unless mods agree), give genuinely useful answers with **no link and no DM funnel**. Never route links through DMs to get round a rule. When posting about named professors, only say positive, factual things ("publishing actively on X"); never post a score or ranking of an individual.

| Dates | Do | Link |
|---|---|---|
| Nov 2–6 | Domain live, cards checked (section 3). Post in your department and NUST alumni groups. Ask 2–3 South Asia FB/WhatsApp group admins for permission; offer each a free Pro key and a group code. | `?ref=nust`, `?ref=pk-wa-<group>&code=<GROUP>` |
| **Wed–Thu Nov 4–5 or Tue–Thu Nov 10–12, 8–10am ET** (skip Nov 3, US election day) | **Show HN:** "Show HN: Rank PhD advisors from OpenAlex in the browser, no backend". Say the top 5 is free and there is no sign-up. Link straight to a prefilled search. Stay in the thread all day. | `?ref=hn&q=LLM%20safety` |
| Nov 9–13 | Indie Hackers build-in-public post (stack, OpenAlex costs, first numbers). r/SideProject disclosed maker post. First LinkedIn/X "Topic Radar" post. | `?ref=ih`, `?ref=sideproject`, `?utm_source=linkedin` |
| Nov 16–20 | Approved WhatsApp/FB group posts with a free "active profs on {topic}" image. Rising PIs post. ~Nov 20: first Kit broadcast. Optional low-effort Product Hunt launch. | `?ref=pk-wa-<group>`, `?ref=ph` |
| Nov 23–30 | Topic Radar post. Reach out to 3–5 PhD-application YouTubers/consultants with a free key, a 15% code and the affiliate link (30% commission). ~Nov 28: Kit broadcast "Dec 1 deadlines: last week to email". | `?ref=yt-<name>&code=<NAME>` |
| Dec 1–15 | Rising PIs post. ~Dec 10: final Kit broadcast with a time-limited code. Answer every support email the same day. | as above |
| After Dec 15 | Ask buyers for one-line testimonials (add to `testimonials`). Keep the email list for Aug–Sept 2027. | |

**Weekly rhythm (LinkedIn/X):** one **Topic Radar** post ("who is publishing on {topic} this year: 5 labs to know") and one **Rising PIs** post ("early-career faculty in {topic} who often recruit"). Each links to the prefilled search, tagged `?utm_source=linkedin` or `?utm_source=x`. The page shows the free top 5 plus the locked "+N more" card, so every shared link teases Pro.

### Per-channel links

The app stores the first-touch `ref`/`utm_source` and sends it to checkout as `checkout[custom][source]`; `?code=` pre-fills the discount at checkout for 30 days; `?aff=` is handled by Lemon Squeezy's affiliate script. WhatsApp and Telegram send no referrer, so **always use a tagged link** there.

| Channel | Link suffix | Code |
|---|---|---|
| NUST / department groups | `?ref=nust&code=NUSTSOC` | 50% society code |
| Each WhatsApp/FB group | `?ref=pk-wa-<group>&code=<GROUP>` | 30% per group |
| Hacker News | `?ref=hn&q=<topic>` | none |
| Product Hunt | `?ref=ph` | optional launch code |
| Indie Hackers / r/SideProject | `?ref=ih` / `?ref=sideproject` | none |
| LinkedIn / X | `?utm_source=linkedin` / `?utm_source=x` | none |
| Creators | `?ref=yt-<name>&code=<NAME>&aff=<id>` | 15% code + 30% commission |

Create each code in Lemon Squeezy (Discounts), and add a label in `CONFIG.codes` if you want the banner to say what it is.

**Affiliate floor: at least $5 owner net per referred sale. Never stack a 30% code with a 30% commission.** Approximate owner net on a $12 non-US sale after fees and Lemon Squeezy's 3% affiliate fee (assuming commission on the amount paid; recheck docs.lemonsqueezy.com/help/affiliates-for-merchants/fees):

| Deal | Owner net |
|---|---|
| 30% code + 30% commission | ≈ $4.50 (below floor, don't) |
| 40% commission, no code | ≈ $5.50 |
| 30% commission + 15% code (default) | ≈ $5.60 |

Partners in Pakistan may not be able to receive Lemon Squeezy affiliate payouts. For them, skip `aff`, give them their own discount code, count its redemptions in the orders export, and pay monthly by bank transfer or JazzCash.

### Weekly checkpoint (every Monday)

Events come from Umami; sales and `custom.source` from Lemon Squeezy orders.

| Week of | Visitors | Searches | paywall_view | upgrade_click (by source) | checkout_click | Sales | Sales by code/source | Sign-ups |
|---|---|---|---|---|---|---|---|---|
| Nov 2 | | | | | | | | |
| Nov 9 | | | | | | | | |
| Nov 16 | | | | | | | | |
| Nov 23 | | | | | | | | |
| Nov 30 | | | | | | | | |
| Dec 7 | | | | | | | | |

Targets: by Nov 16, ≥ 300 visitors and ≥ 3 sales; by Dec 7, ≥ 25 total sales; by Dec 15, 60–100.

Decision rules (only after ≥ 200 paywall views, so noise doesn't drive changes):
- Fewer than ~2% of paywall views lead to a checkout click: test the free limits (`freeResults`, the free email draft) or the price.
- Search errors above 15% (`search` events with an error): fix search before more marketing.
- After 4 weeks, drop any channel yielding under 1 sale per 5 hours of effort. If visitors are fine but sales are 0, look at `upgrade_click` sources (which locked feature people want) and checkout failures (add the local-payment fallback). If visitors are low, post more, not less.

## 5. Upsells once it sells (each about a day of work)

- **Static topic pages (SEO, for the 2027 season):** a Node script reusing `src/openalex.js` for 30–50 high-demand topics (US first), run by a separate workflow on `workflow_dispatch` + weekly cron with an `OPENALEX_API_KEY` repo secret, a delay between topics and a clean stop on 429. Commit `topics/<slug>.html` + `sitemap.xml` so a quota failure never blocks a deploy. Each page: free top 5 with metrics, how ranking works, dated "last updated", canonical tag, and a CTA into the deep-linked live search. Too slow to rank for this season, so do it after Dec 15.

- **"Full season" pass at $19** that adds saved searches, plus a weekly email with new papers from shortlisted professors. Needs a tiny backend.
- **Bundle:** Pro plus your own SOP and cold-email template pack (Gumroad PDF) for $25.
- **Master's and postdoc mode:** the same engine with different wording, which helps cover the off-season.
- **"Has funding" signal:** add NSF/NIH grant lookups (public APIs) to flag professors with active grants. This is a strong differentiator.
