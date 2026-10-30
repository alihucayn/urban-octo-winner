# AdvisorScout

Find PhD advisors who are publishing on your research topic **right now**, ranked by
lab-head signals, with a cold-email draft and an outreach tracker.

A static web app with no backend and no hosting bill. Visitors' browsers query
[OpenAlex](https://openalex.org) (250M+ scholarly works, CC0) directly, and Pro is unlocked
with a license key from Lemon Squeezy or Gumroad.

**Business plan, research and launch checklist:** [docs/LAUNCH.md](docs/LAUNCH.md)

## How it ranks

For a topic query it:

1. Groups recent works matching the topic by author (`group_by=authorships.author.id`) to find who publishes most on it.
2. Loads those author profiles and keeps academics with h-index ≥ N at an institution in the chosen country.
3. Reads their recent on-topic papers to measure **senior (last) author share** and **distinct first authors** (lab size).
4. Scores each person 0–100: volume 40, senior-author share 25, seniority 15, lab size 10, recency 10.

Each search costs 3–4 OpenAlex requests and responses are cached per browser session.

## Free vs Pro

| | Free | Pro ($12 one-time) |
|---|---|---|
| Searches | unlimited | unlimited |
| Results per search | 5 | up to 40 |
| Email draft from latest paper | — | ✓ |
| CSV export | — | ✓ |
| Outreach tracker | 3 professors | unlimited |

## Run locally

```bash
npm test          # unit tests (Node 20+)
npm start         # http://localhost:8080
```

Set `licenseProvider: 'none'` in `src/config.js` to try Pro features locally.

## Files

- `src/openalex.js`: search, scoring, CSV and email-draft logic (no DOM, unit tested)
- `src/license.js`: license-key activation and weekly re-check
- `src/app.js`: UI
- `src/config.js`: **edit this before launch** (checkout URL, price, license provider)
