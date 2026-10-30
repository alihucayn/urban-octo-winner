# AdvisorScout: business plan and launch checklist

Goal: **$100–500/month** with low running cost and little maintenance.

## 1. Research summary: why this and not something else

| Option researched | Verdict |
|---|---|
| **Apify Store actors** (scrapers sold per run) | Distribution is built in and Apify pays out monthly, but every obvious niche is saturated. Searches turned up 15+ near-identical "Greenhouse/Lever/Ashby jobs" actors, 15+ Shopify scrapers at about $1 per 1,000 results, and 6+ "website audit lead" actors. Rental pricing is being retired in favour of pay-per-event, and Apify deducts platform compute from payouts. PayPal is unavailable in Pakistan, so payouts need a $100 minimum via wire. **Rejected: a race to the bottom on price.** |
| Generic micro-SaaS ($9–29/mo B2B tools) | Workable, but needs a market you understand plus months of marketing to reach about 30 customers. |
| Templates on Gumroad | Easy to copy, low price, and discovery is hard. |
| **Niche tool for PhD applicants** ✅ | You know this market from the inside. Demand is seasonal but large and recurring: hundreds of thousands of international applicants each year, with peak season from **September to December, which is now**. Competitors (SupervisorMatch, ApexApply, UniversityCube) exist, which shows demand, but none offer a cheap "who is actively publishing on X and runs a lab" ranking. Data is free (OpenAlex, CC0), hosting is free (static site), and there is nothing to maintain server-side. |

### Unit economics

- Price: **$12 one-time** for the season. Applicants routinely pay $50–300 for SOP reviews, so $12 is an impulse buy.
- Lemon Squeezy fee: 5% + $0.50, so you keep about **$10.90 per sale**.
- **$100/mo ≈ 10 sales. $500/mo ≈ 46 sales.** At a 2–3% visitor-to-buyer rate that takes roughly 500–2,000 visitors a month.
- Costs: $0 (GitHub Pages or Cloudflare Pages). A custom domain is about $10/yr and optional.
- Each search runs in the visitor's own browser against OpenAlex, so your API cost does not grow with users.

### Risks (be honest with yourself)

- **Seasonality.** Expect most sales from September to January. In the off-season, sell to Master's applicants and postdoc seekers, or add the yearly-pass upsell in section 5.
- **Client-side paywall.** A determined developer can bypass it. The target users won't bother at $12, but do not raise the price above about $29 without moving the results behind a small server.
- **OpenAlex limits.** OpenAlex now meters API usage, with a free daily allowance (higher with a free API key). Because calls come from each visitor's browser, each visitor has their own allowance. If that changes, put a free Cloudflare Worker proxy with caching in front of it. **Check the current rules at https://developers.openalex.org before launch.** I could not reach their docs from my build environment.
- **Data quality.** OpenAlex sometimes merges or splits authors, and affiliations can be stale. The UI tells users to verify. Keep it that way.

## 2. Payments: set up first (about 1 hour)

PayPal and Stripe don't pay out to Pakistan, so use a merchant of record:

1. **Lemon Squeezy (recommended).** Third-party reviews list Pakistan as supported for bank payouts with a $50 minimum. Check this on their payouts page when you sign up.
   - Create a product "AdvisorScout Pro", price $12, single payment.
   - Enable **License keys** on the product (activation limit 3, never expires).
   - Copy the checkout link into `checkoutUrl` in `src/config.js`.
   - Optional: set `lemonStoreId` and `lemonProductId` (numbers from the dashboard) so keys from other stores are rejected.
2. **Alternatives:** Gumroad (set `licenseProvider: 'gumroad'` and `gumroadProductId`) or Dodo Payments, which advertises payouts to Pakistan. With Dodo, set `licenseProvider` to whichever API you wire up.
3. Make a test purchase in test mode and activate the key on the live site. If the browser blocks the license call (CORS), tell me and I'll add a 20-line Cloudflare Worker proxy.

## 3. Deploy (about 15 minutes)

1. Merge this branch into `main`.
2. Go to GitHub, then **Settings → Pages → Source: GitHub Actions**. The included workflow runs the tests and deploys on every push to `main`.
3. Optional: buy a domain such as `advisorscout.app` and point it at Pages.
4. Put your email in `openalex.mailto` in `src/config.js`, and a free OpenAlex API key in `apiKey` if they recommend one for browser apps.

## 4. Get the first 50 customers (the part that actually makes money)

Spend 30–45 minutes a day, every day, from now until mid-December:

1. **Reddit:** r/gradadmissions, r/PhD, r/GradSchool, r/MachineLearning (only in the weekly "simple questions" thread), and country subs like r/pakistan and r/india. Don't spam links. Answer "how do I find a supervisor in X?" posts with a real answer and a screenshot of results, and mention the tool once.
2. **Facebook and WhatsApp groups** for Pakistani, Indian, Bangladeshi, Nigerian and Iranian students applying abroad. These groups have tens of thousands of members and a high share of buyers.
3. **LinkedIn and X.** Post "I analysed who's actually publishing on [hot topic] in the US: here are 10 professors running active labs" using the tool's output. One post per week per hot topic (LLM safety, robotics, computational biology, and so on). Each post is free marketing and shows the product in action.
4. **Launch posts** on Product Hunt, Hacker News ("Show HN"), and Indie Hackers once you have 3–5 testimonials.
5. **University channels.** Your department and the NUST alumni group. Offer the student society a 50%-off code.
6. **Referral discount.** Create a 30% code in Lemon Squeezy for each consultant or YouTuber who makes PhD-application content, and offer them a 30% affiliate cut (Lemon Squeezy has affiliates built in).

Track two numbers weekly: visitors (add free Cloudflare Web Analytics) and sales.

## 5. Upsells once it sells (each about a day of work)

- **"Full season" pass at $19** that adds saved searches, plus a weekly email with new papers from shortlisted professors. Needs a tiny backend.
- **Bundle:** Pro plus your own SOP and cold-email template pack (Gumroad PDF) for $25.
- **Master's and postdoc mode:** the same engine with different wording, which helps cover the off-season.
- **"Has funding" signal:** add NSF/NIH grant lookups (public APIs) to flag professors with active grants. This is a strong differentiator.
