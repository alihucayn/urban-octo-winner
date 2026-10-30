# AdvisorScout

Find PhD advisors who are publishing on your research topic **right now**, ranked by
lab-head signals, with a cold-email draft and an outreach tracker.

A static web app with no backend and no hosting bill. Visitors' browsers query
[OpenAlex](https://openalex.org) (250M+ scholarly works, CC0) directly. An optional free
Cloudflare Worker (`worker/openalex-proxy.js`, set as `openalex.proxy`) holds the owner's key,
caches for 24h and serves Pro searches plus free searches that hit a 429. Pro is unlocked with a license key
from Lemon Squeezy or Gumroad. The unlock is honor-system: client-side checks can be bypassed
with devtools, so the price stays low and the pitch is convenience, not DRM.

**Business plan, research and launch checklist:** [docs/LAUNCH.md](docs/LAUNCH.md) · **Ready-to-post copy:** [docs/launch-posts.md](docs/launch-posts.md)

## How it ranks

For a topic query it:

1. Groups recent, non-retracted works whose **title or abstract** matches the topic by author (`group_by=authorships.author.id`) to find who publishes most on it.
2. Loads those author profiles and keeps academics with h-index ≥ N at an institution in the chosen country (backfilling from a second page if filters remove too many).
3. Reads their recent on-topic papers in small author chunks (so every candidate gets papers) to measure **senior (last) author share** and **distinct first authors** (lab size). Consortium papers (50+ or truncated author lists) are left out of those counts and down-weighted in volume.
4. Scores each person 0–100: volume 40, senior-author share 25, seniority 15, lab size 10, recency 10. With fewer than 3 papers seen, it scores volume and seniority only and shows "Limited paper data".

Each search costs about 10–15 OpenAlex requests (timeout + retry, cached for 7 days in the browser and for 24h in the proxy).

## Free vs Pro

| | Free | Pro ($12 one-time) |
|---|---|---|
| Searches | your network's free OpenAlex allowance (then the proxy, if set) | through the owner's proxy quota (or bring your own free key) |
| Results per search | 5 | up to 40 |
| Cold-email starter (latest first/last-author paper) | sample for the #1 match | every match |
| CSV export | — | ✓ |
| Outreach tracker | 3 professors, JSON backup/restore | unlimited |

## Links and attribution

- `?q=<topic>&country=GB&years=3&minH=8` prefills and runs a search (values are validated against the form). After every search the URL is updated, and the results have "Copy link" and "Share on WhatsApp" buttons.
- `?ref=` / `?utm_source=` set the first-touch channel, sent to Lemon Squeezy as `checkout[custom][source]`.
- `?code=` pre-fills a Lemon Squeezy discount code for 30 days. `?aff=` is handled by Lemon Squeezy's `affiliate.js` when `lsStoreSlug` is set.

## Run locally

```bash
npm test          # unit tests (Node 20+)
npm start         # http://localhost:8080
```

Set `licenseProvider: 'none'` in `src/config.js` to try Pro features locally (it only works on localhost). `node scripts/check-config.mjs` shows what must be set before deploy.

## Files

- `src/openalex.js`: search, scoring, CSV and email-draft logic (no DOM, unit tested)
- `src/http.js`: fetch with timeout, retry and typed errors
- `src/tracker.js`, `src/csv.js`: tracker dates, backup validation, CSV
- `src/license.js`: license-key activation, weekly re-check, device deactivation
- `src/analytics.js`: cookieless funnel events (allowlisted, no personal data)
- `src/share.js`: deep links, share links, discount-code attribution, regional offers, checkout URL (unit tested)
- `src/app.js`: UI
- `guide.html`: free, printable PhD cold-email checklist (linked from the app; indexable)
- `assets/`: social card (`og.png`), favicon, touch icon
- `scripts/make-sample.mjs`: writes `src/sample.json`, the 3 real result cards shown before a search
- `src/config.js`: **edit this before launch** (checkout URL, store/product IDs, proxy URL, analytics)
- `worker/openalex-proxy.js`: Cloudflare Worker that holds the OpenAlex key, caches and rate-limits
