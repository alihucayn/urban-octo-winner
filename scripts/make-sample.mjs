// Writes src/sample.json: 3 real result cards shown on the landing page before a search.
// Run on your own machine (needs network to OpenAlex):
//   OPENALEX_KEY=... node scripts/make-sample.mjs "LLM safety"   (key optional)
// Commit the file and re-run monthly so the cards stay current. To hide the sample, set
// "results" to [] (keep the file: deleting it makes every page load log a 404).
import { writeFileSync } from 'node:fs';
import { findAdvisors, BASE } from '../src/openalex.js';
import { makeFetchJson } from '../src/http.js';

const query = process.argv[2] || 'LLM safety';
const out = await findAdvisors({ query }, { fetchJson: makeFetchJson({}), cfg: { base: BASE, apiKey: process.env.OPENALEX_KEY || '' } });
const keep = ['name', 'institution', 'country', 'instSource', 'score', 'badges', 'topicCount', 'lastAuthorShare', 'hIndex', 'lowEvidence', 'students', 'papers', 'openalex'];
const results = out.slice(0, 3).map((r) => Object.fromEntries(keep.map((k) => [k, r[k]])));
const date = new Date().toLocaleString('en-US', { month: 'short', year: 'numeric' });
writeFileSync(new URL('../src/sample.json', import.meta.url), JSON.stringify({ query, date, results }, null, 2) + '\n');
console.log(`Wrote ${results.length} sample results for "${query}" (${date}).`);
