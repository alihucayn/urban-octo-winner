import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findAdvisors, buildUrl, workStats, toCsv, emailHook, surname, cleanText, scoreCandidate, filterQuery, badges, pickHookPaper, firstPlaceholder } from '../src/openalex.js';

const now = new Date('2026-10-30');
const A = (id) => ({ id: `https://openalex.org/${id}` });
const auth = (id, pos, name = id, institutions) => ({ author: { ...A(id), display_name: name }, author_position: pos, ...(institutions && { institutions }) });

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
    { id: 'W4', title: 'Fourth', publication_year: 2024, publication_date: '2024-02-01', authorships: [auth('A2', 'first', 'Sam Student'), auth('X1', 'last')] },
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
  assert.equal(out.partial, false);
  assert.equal(calls.filter((c) => c.includes('group_by')).length, 1);
  assert.match(calls[0], /authorships.institutions.country_code%3AUS/);
  assert.match(calls[0], /from_publication_date%3A2023-01-01/);
});

test('search uses title/abstract filter, excludes retractions, and never per_page above 100', async () => {
  const calls = [];
  await findAdvisors({ query: 'graph, learning | x', now }, { fetchJson: fakeFetch(calls) });
  const worksCalls = calls.filter((c) => new URL(c).pathname === '/works');
  assert.ok(worksCalls.length >= 2);
  for (const c of worksCalls) {
    const u = new URL(c);
    assert.equal(u.searchParams.get('search'), null);
    assert.match(u.searchParams.get('filter'), /^title_and_abstract\.search:graph learning x,/);
    assert.match(u.searchParams.get('filter'), /is_retracted:false/);
    assert.ok(+u.searchParams.get('per_page') <= 100);
  }
  assert.match(new URL(calls[0]).searchParams.get('filter'), /type:article\|preprint\|review/);
  assert.equal(filterQuery('a,b|c:d'), 'a b c d');
});

test('falls back to no type filter when the typed search finds nothing', async () => {
  const calls = [];
  let n = 0;
  const out = await findAdvisors({ query: 'x', now }, {
    fetchJson: async (url) => (calls.push(url), n++ === 0 ? { group_by: [] } : { group_by: [] }),
  });
  assert.equal(out.length, 0);
  assert.equal(out.reason, 'no_works');
  assert.equal(calls.length, 2);
  assert.doesNotMatch(calls[1], /type%3A/);
});

test('reports "filtered" with drop counts when every author fails the filters', async () => {
  const out = await findAdvisors({ query: 'x', minH: 99, now }, { fetchJson: fakeFetch([]) });
  assert.equal(out.length, 0);
  assert.equal(out.reason, 'filtered');
  assert.equal(out.dropped.minH, 3);
  assert.equal(out.dropped.institution, 0);
});

test('step 3 gives every candidate its own share of papers even when one author floods the results', async () => {
  const many = (id) => ({
    group_by: Array.from({ length: 12 }, (_, i) => ({ key: `https://openalex.org/${i === 0 ? 'A1' : i === 1 ? 'A2' : 'B' + i}`, count: 50 - i })),
  });
  const prof = (id, name) => ({ ...A(id), display_name: name, works_count: 100, summary_stats: { h_index: 30 },
    last_known_institutions: [{ display_name: 'Uni', country_code: 'US', type: 'education' }] });
  const authorsRes = { results: [prof('A1', 'Flood Author'), prof('A2', 'Quiet Prof'), ...Array.from({ length: 10 }, (_, i) => prof('B' + (i + 2), 'B' + i))] };
  const floodWorks = Array.from({ length: 200 }, (_, i) => ({ id: 'F' + i, publication_date: '2026-05-01', publication_year: 2026, title: 'F' + i,
    authorships: [auth('S' + i, 'first'), auth('A1', 'last')] }));
  const a2Works = Array.from({ length: 5 }, (_, i) => ({ id: 'Q' + i, publication_date: '2026-04-01', publication_year: 2026, title: 'Q' + i,
    authorships: [auth('T' + i, 'first'), auth('A2', 'last')] }));
  const fetchJson = async (url) => {
    const u = new URL(url);
    if (u.searchParams.get('group_by')) return many();
    if (u.pathname === '/authors') return authorsRes;
    const f = u.searchParams.get('filter');
    const per = +u.searchParams.get('per_page');
    const res = [];
    if (/A1/.test(f)) res.push(...floodWorks);
    if (/A2/.test(f)) res.push(...a2Works);
    return { results: res.slice(0, per) };
  };
  const out = await findAdvisors({ query: 'x', now }, { fetchJson });
  const quiet = out.find((r) => r.name === 'Quiet Prof');
  assert.ok(quiet.papers.length > 0);
  assert.ok(!quiet.badges.includes('Possibly student/postdoc'));
  assert.equal(quiet.lastAuthorShare, 1);
});

test('a failed step-3 chunk marks the result partial instead of failing the search', async () => {
  const f = fakeFetch([]);
  const out = await findAdvisors({ query: 'x', now }, {
    fetchJson: async (url) => {
      if (new URL(url).pathname === '/works' && !url.includes('group_by')) throw new Error('boom');
      return f(url);
    },
  });
  assert.equal(out.partial, true);
  assert.ok(out.length > 0);
  assert.ok(out.every((r) => r.lowEvidence && r.badges[0] === 'Limited paper data'));
});

test('seen < 3 gives lowEvidence and no student badge', () => {
  const stats = workStats('A9', [{ id: 'W', publication_date: '2020-01-01', authorships: [auth('A9', 'middle'), auth('Z', 'last')] }]);
  assert.equal(stats.seen, 1);
  const s = scoreCandidate({ topicCount: 10, hIndex: 50, stats }, now);
  assert.ok(s > 60, `score ${s}`);
  assert.deepEqual(badges({ hIndex: 5, worksCount: 20, stats }), ['Limited paper data']);
});

test('consortium papers rank below a small-lab PI', () => {
  const big = Array.from({ length: 6 }, (_, i) => ({ id: 'C' + i, is_authors_truncated: true, publication_date: '2026-01-01',
    authorships: [auth('F', 'first'), ...Array.from({ length: 98 }, (_, j) => auth('M' + j, 'middle')), auth('K1', 'last')] }));
  const small = Array.from({ length: 6 }, (_, i) => ({ id: 'S' + i, publication_date: '2026-01-01',
    authorships: [auth('St' + i, 'first'), auth('P1', 'last')] }));
  const kStats = workStats('K1', big);
  const pStats = workStats('P1', small);
  assert.equal(kStats.lastAuthorShare, 0);
  assert.equal(kStats.students.length, 0);
  const k = scoreCandidate({ topicCount: 60, hIndex: 80, stats: kStats }, now);
  const p = scoreCandidate({ topicCount: 6, hIndex: 15, stats: pStats }, now);
  assert.ok(p > k, `PI ${p} vs consortium ${k}`);
});

test('country volume only counts papers with the candidate affiliated in that country', () => {
  const w = (id, cc) => ({ id, publication_date: '2026-01-01', authorships: [auth('A', 'last', 'A', [{ display_name: 'U', country_code: cc }]), auth('B', 'first')] });
  const s = workStats('A', [w('1', 'US'), w('2', 'DE'), w('3', 'DE'), w('4', 'DE')], { country: 'US' });
  assert.equal(s.volumeFactor, 0.25);
  assert.equal(s.paperInst.display_name, 'U');
});

test('rejects an empty topic', async () => {
  await assert.rejects(findAdvisors({ query: ' ' }, { fetchJson: async () => ({}) }), /research topic/);
});

test('buildUrl adds credentials only when set and honours a proxy base', () => {
  assert.equal(buildUrl('/works', { a: 1, b: '' }), 'https://api.openalex.org/works?a=1');
  assert.match(buildUrl('/works', {}, { apiKey: 'k', mailto: 'm@x.org' }), /api_key=k&mailto=m%40x.org/);
  assert.equal(buildUrl('/works', { a: 1 }, { base: 'https://p.example.workers.dev/' }), 'https://p.example.workers.dev/works?a=1');
});

test('workStats ignores solo papers for senior-author share', () => {
  const s = workStats('A1', [{ id: 'W', authorships: [auth('A1', 'last')] }]);
  assert.equal(s.lastAuthor, 0);
});

test('csv escapes quotes, commas and formula prefixes; email hook cites latest paper', async () => {
  const out = await findAdvisors({ query: 'graph learning', now }, { fetchJson: fakeFetch([]) });
  out[0].institution = 'MIT, "CSAIL"';
  out[0].name = '=HYPERLINK("x")';
  const csv = toCsv(out);
  assert.ok(csv.startsWith('﻿'));
  assert.match(csv, /"MIT, ""CSAIL"""/);
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
  out[0].name = 'Ada Lovelace';
  const e = emailHook(out[0]);
  assert.match(e, /^Subject: Prospective PhD student \(\[term\]\): your work on "Newest"/);
  assert.match(e, /Dear Prof\. Lovelace,[\s\S]*paper "Newest"/);
});

test('surname handles suffixes, comma form, particles and initials', () => {
  assert.equal(surname('John Smith Jr.'), 'Smith');
  assert.equal(surname('Mary Jones III'), 'Jones');
  assert.equal(surname('Smith, J.'), 'Smith');
  assert.equal(surname('Ludwig van Beethoven'), 'van Beethoven');
  assert.equal(surname('Ana de la Cruz'), 'de la Cruz');
  assert.equal(surname('Wei Zhang '), 'Zhang');
  assert.equal(surname('A. B. J.'), null);
  assert.equal(surname(''), null);
});

test('email draft degrades gracefully and flags unconfirmed institutions', () => {
  const base = { name: 'J.', query: 'robots', institution: 'Old Uni', instConfirmed: false, papers: [] };
  const e = emailHook(base);
  assert.match(e, /Dear Professor \[Last name\],/);
  assert.match(e, /\[paper you read\]/);
  assert.match(e, /\[confirm: Old Uni\]/);
  const e2 = emailHook({ ...base, name: 'Kim Lee', instConfirmed: true, papers: [{ title: 'T', year: null }] });
  assert.match(e2, /your recent paper "T"/);
  assert.doesNotMatch(e2, /undefined|confirm/);
});

test('cleanText strips markup and decodes entities', () => {
  assert.equal(cleanText('<i>In vivo</i> R&amp;D of <scp>dna</scp> &#x3B1;-helix'), 'In vivo R&D of dna α-helix');
});

const many = (n, me, pos) => Array.from({ length: n }, (_, k) => auth(k === 0 ? me : `X${k}`, k === 0 ? pos : 'middle'));

test('hook paper skips consortium papers, errata and editorials, and strips HTML', () => {
  const sorted = [
    { id: 'W1', title: 'Big consortium result', authorships: [auth('X0', 'first'), ...many(40, 'A1', 'middle')] },
    { id: 'W2', title: 'Erratum: Older thing', authorships: [auth('A1', 'last')] },
    { id: 'W3', title: 'Something', type: 'editorial', authorships: [auth('A1', 'first')] },
    { id: 'W4', title: '<i>In vivo</i> results', publication_year: 2025, authorships: [auth('S1', 'first'), auth('A1', 'last')] },
  ];
  const hook = pickHookPaper('A1', sorted);
  assert.equal(hook.id, 'W4');
  const s = workStats('A1', sorted.map((w, i) => ({ ...w, publication_date: `2026-0${9 - i}-01` })));
  assert.equal(s.hookPaper.title, 'In vivo results');
  // Falls back to the newest usable paper when they led none.
  assert.equal(pickHookPaper('A1', sorted.slice(0, 2)).id, 'W1');
  assert.equal(pickHookPaper('A1', [sorted[1]]), null);
});

test('surname keeps particles and drops suffixes', () => {
  assert.equal(surname('Jan van der Berg'), 'van der Berg');
  assert.equal(surname('Robert Downey Jr.'), 'Downey');
});

test('email draft uses Dr for UK-style countries and the hook paper', () => {
  const p = { name: 'Jan van der Berg', country: 'GB', query: 'x', institution: 'Oxford', instConfirmed: true,
    papers: [{ title: 'Correction', year: 2026 }], hookPaper: { title: 'Real work', year: 2025 } };
  const e = emailHook(p);
  assert.match(e, /Dear Dr van der Berg,/);
  assert.match(e, /your 2025 paper "Real work"/);
  assert.match(e, /Check their title/);
  assert.match(emailHook({ ...p, country: 'US' }), /Dear Prof\. van der Berg,/);
  assert.doesNotMatch(emailHook({ ...p, country: 'US' }), /Check their title/);
});

test('firstPlaceholder finds the first unfilled bracket', () => {
  assert.deepEqual(firstPlaceholder('Hi [name], from [uni]'), { index: 3, length: 6, text: '[name]' });
  assert.equal(firstPlaceholder('All filled in.'), null);
});

test('openalexRoute and viaProxy: direct by default, proxy for Pro, fallback for free', async () => {
  const { openalexRoute, viaProxy } = await import('../src/openalex.js');
  assert.equal(openalexRoute({ proxy: '', pro: true, ownKey: '' }), 'direct');
  assert.equal(openalexRoute({ proxy: 'https://p.dev', pro: false, ownKey: 'k' }), 'direct');
  assert.equal(openalexRoute({ proxy: 'https://p.dev', pro: true, ownKey: '' }), 'proxy');
  assert.equal(openalexRoute({ proxy: 'https://p.dev', pro: false, ownKey: '' }), 'fallback');
  const direct = buildUrl('/works', { filter: 'a:b' }, { apiKey: 'secret', mailto: 'm@x.org' });
  const proxied = viaProxy(direct, 'https://advisorscout-api.me.workers.dev/');
  assert.match(proxied, /^https:\/\/advisorscout-api\.me\.workers\.dev\/works\?filter=a%3Ab/);
  assert.doesNotMatch(proxied, /secret|api_key/);
  assert.equal(viaProxy('https://api.openalex.org/authors?x=1', 'https://p.dev/api'), 'https://p.dev/api/authors?x=1');
});
