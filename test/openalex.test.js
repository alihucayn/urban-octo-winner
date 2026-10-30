import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findAdvisors, buildUrl, workStats, toCsv, emailHook } from '../src/openalex.js';

const now = new Date('2026-10-30');
const A = (id) => ({ id: `https://openalex.org/${id}` });
const auth = (id, pos, name = id) => ({ author: { ...A(id), display_name: name }, author_position: pos });

const groups = {
  group_by: [
    { key: 'https://openalex.org/A1', count: 12 },
    { key: 'https://openalex.org/A2', count: 9 },
    { key: 'https://openalex.org/A3', count: 4 },
    { key: 'unknown', count: 99 },
  ],
};
const authors = {
  results: [
    { ...A('A1'), display_name: 'Ada Prof', works_count: 140, cited_by_count: 9000, summary_stats: { h_index: 40 },
      last_known_institutions: [{ display_name: 'MIT', country_code: 'US', type: 'education' }] },
    { ...A('A2'), display_name: 'Sam Student', works_count: 20, cited_by_count: 100, summary_stats: { h_index: 9 },
      last_known_institutions: [{ display_name: 'MIT', country_code: 'US', type: 'education' }] },
    { ...A('A3'), display_name: 'Ivy Industry', works_count: 50, cited_by_count: 500, summary_stats: { h_index: 12 },
      last_known_institutions: [{ display_name: 'BigCo', country_code: 'GB', type: 'company' }] },
  ],
};
const works = {
  results: [
    { id: 'W1', title: 'Newest', publication_year: 2026, publication_date: '2026-06-01', authorships: [auth('A2', 'first', 'Sam Student'), auth('A1', 'last')] },
    { id: 'W2', title: 'Older', publication_year: 2025, publication_date: '2025-01-01', authorships: [auth('S9', 'first', 'Lee'), auth('A2', 'middle'), auth('A1', 'last')] },
    { id: 'W3', title: 'Third', publication_year: 2024, publication_date: '2024-03-01', authorships: [auth('S8', 'first', 'Kim'), auth('A1', 'last')] },
  ],
};

function fakeFetch(calls) {
  return async (url) => {
    calls.push(url);
    const u = new URL(url);
    if (u.pathname === '/authors') return authors;
    if (u.searchParams.get('group_by')) return groups;
    return works;
  };
}

test('ranks the lab head above the student and drops non-academic or country-mismatched authors', async () => {
  const calls = [];
  const out = await findAdvisors({ query: 'graph learning', country: 'us', now }, { fetchJson: fakeFetch(calls) });
  assert.deepEqual(out.map((r) => r.name), ['Ada Prof', 'Sam Student']);
  const ada = out[0];
  assert.equal(ada.lastAuthorShare, 1);
  assert.deepEqual(ada.students.sort(), ['Kim', 'Lee', 'Sam Student']);
  assert.ok(ada.badges.includes('Likely PI'));
  assert.ok(ada.badges.includes('Active lab'));
  assert.equal(ada.papers[0].title, 'Newest');
  assert.ok(out[1].badges.includes('Possibly student/postdoc'));
  assert.ok(ada.score > out[1].score);
  assert.equal(calls.length, 3);
  assert.match(calls[0], /authorships.institutions.country_code%3AUS/);
  assert.match(calls[0], /from_publication_date%3A2023-01-01/);
});

test('returns empty when nothing matches', async () => {
  const out = await findAdvisors({ query: 'x', now }, { fetchJson: async () => ({ group_by: [] }) });
  assert.deepEqual(out, []);
});

test('rejects an empty topic', async () => {
  await assert.rejects(findAdvisors({ query: ' ' }, { fetchJson: async () => ({}) }), /research topic/);
});

test('buildUrl adds credentials only when set', () => {
  assert.equal(buildUrl('/works', { a: 1, b: '' }), 'https://api.openalex.org/works?a=1');
  assert.match(buildUrl('/works', {}, { apiKey: 'k', mailto: 'm@x.org' }), /api_key=k&mailto=m%40x.org/);
});

test('workStats ignores solo papers for senior-author share', () => {
  const s = workStats('A1', [{ id: 'W', authorships: [auth('A1', 'last')] }]);
  assert.equal(s.lastAuthor, 0);
});

test('csv escapes quotes and commas; email hook cites latest paper', async () => {
  const out = await findAdvisors({ query: 'graph learning', now }, { fetchJson: fakeFetch([]) });
  out[0].institution = 'MIT, "CSAIL"';
  const csv = toCsv(out);
  assert.match(csv, /"MIT, ""CSAIL"""/);
  assert.match(emailHook(out[0]), /Dear Prof\. Prof,[\s\S]*"Newest"/);
});
