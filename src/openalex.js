// Advisor discovery on top of the OpenAlex API (https://openalex.org).
// Pure logic: everything that touches the network goes through `fetchJson`,
// so the scoring can be tested offline with fixtures.
import { csv } from './csv.js';

export const BASE = 'https://api.openalex.org';

export function shortId(id) {
  return String(id || '').replace('https://openalex.org/', '');
}

export function buildUrl(path, params = {}, cfg = {}) {
  const url = new URL((cfg.base || BASE).replace(/\/+$/, '') + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }
  if (cfg.apiKey) url.searchParams.set('api_key', cfg.apiKey);
  if (cfg.mailto) url.searchParams.set('mailto', cfg.mailto);
  return url.toString();
}

// Which path an OpenAlex call takes. 'direct' uses the visitor's own (per-IP or own-key)
// allowance; 'proxy' uses the owner's Worker; 'fallback' tries direct, then the proxy on a 429.
export function openalexRoute({ proxy, pro, ownKey }) {
  if (!proxy || ownKey) return 'direct';
  return pro ? 'proxy' : 'fallback';
}

// Rewrites a direct OpenAlex URL onto the proxy. Credentials never go to the proxy.
export function viaProxy(url, proxy) {
  const u = new URL(url);
  u.searchParams.delete('api_key');
  const p = new URL(proxy);
  return p.origin + p.pathname.replace(/\/+$/, '') + u.pathname + u.search;
}

function sinceDate(years, now) {
  return `${now.getUTCFullYear() - years}-01-01`;
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// Runs `fn` over `items` with at most `limit` in flight; results keep input order.
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// Commas and pipes are OpenAlex filter syntax, so they can't appear inside a filter value.
export function filterQuery(q) {
  return String(q || '').replace(/[,|:]/g, ' ').replace(/\s+/g, ' ').trim();
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
// Titles carry JATS/HTML markup (<i>, <scp>, &amp;) from publishers.
export function cleanText(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') {
        const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

const SUFFIX = /^(jr|sr|ii|iii|iv|v|phd|ph\.d|md|dphil|frs)\.?$/i;
const PARTICLE = /^(van|von|der|den|de|del|della|di|da|du|la|le|dos|das|bin|binti|ibn|al|el|ter|ten|st\.?)$/i;

const isInitial = (w) => /^\p{L}\.?$/u.test(w);

// "Smith, J." -> "Smith"; "Ludwig van Beethoven" -> "van Beethoven"; "Jane Doe Jr." -> "Doe"; "J." -> null.
export function surname(displayName) {
  let name = String(displayName || '').replace(/\s+/g, ' ').trim();
  if (name.includes(',')) {
    const parts = name.split(',').map((x) => x.trim()).filter((x) => x && !SUFFIX.test(x));
    if (parts.length > 1) return !parts[0] || isInitial(parts[0]) ? null : parts[0]; // "Last, First"
    name = parts[0] || '';
  }
  const words = name.split(' ').filter((w) => w && !SUFFIX.test(w));
  if (!words.length) return null;
  let i = words.length - 1;
  while (i > 1 && PARTICLE.test(words[i - 1])) i--; // never swallow the first name
  const last = words.slice(i).join(' ');
  return isInitial(last) ? null : last;
}

// Down-weights consortium papers: 1 up to 30 authors, then 30/n; truncated lists are 100+.
export function paperWeight(w) {
  if (w.is_authors_truncated) return 0.05;
  const n = (w.authorships || []).length;
  return n <= 30 ? 1 : 30 / n;
}
const isConsortium = (w) => w.is_authors_truncated || (w.authorships || []).length > 50;

const NOT_A_HOOK = /^(correction|erratum|corrigendum|retraction|editorial|expression of concern)\b/i;
const NOT_A_HOOK_TYPE = new Set(['erratum', 'editorial', 'retraction', 'paratext']);

// The paper to open a cold email with: the newest one they led (first or last author)
// with 15 or fewer authors, skipping errata and editorials. Falls back to the newest
// remaining paper. `sorted` is newest first.
export function pickHookPaper(authorId, sorted) {
  const ok = sorted.filter((w) => {
    const title = cleanText(w.title || w.display_name);
    return title && !NOT_A_HOOK.test(title) && !NOT_A_HOOK_TYPE.has(w.type);
  });
  const led = ok.find((w) => {
    const auths = w.authorships || [];
    const me = auths.find((a) => shortId(a.author?.id) === authorId);
    return auths.length <= 15 && (me?.author_position === 'first' || me?.author_position === 'last');
  });
  return led || ok[0] || null;
}

function pickInstitution(author, country) {
  const insts = author.last_known_institutions || [];
  const academic = insts.filter((i) => i.type === 'education' || i.type === 'facility');
  const pool = academic.length ? academic : insts;
  if (!country) return pool[0] || null;
  return pool.find((i) => (i.country_code || '').toUpperCase() === country) || null;
}

const paperOf = (w) => ({
  title: cleanText(w.title || w.display_name) || '(untitled)',
  year: w.publication_year || null,
  date: w.publication_date,
  url: w.doi || w.id,
  citations: w.cited_by_count || 0,
});

// Aggregates the candidate's recent on-topic works into PI/lab signals.
// Consortium papers (50+ or truncated author lists) are left out of the
// senior-author and student counts, where author order is often alphabetical.
export function workStats(authorId, works, { country = '' } = {}) {
  const mine = works.filter((w) =>
    (w.authorships || []).some((a) => shortId(a.author?.id) === authorId),
  );
  let last = 0;
  let counted = 0;
  let weight = 0;
  const students = new Set();
  for (const w of mine) {
    const auths = w.authorships || [];
    const me = auths.find((a) => shortId(a.author?.id) === authorId);
    const insts = me?.institutions || [];
    // Papers with no affiliation data count as in-country rather than penalising the author.
    const inCountry = !country || !insts.length || insts.some((i) => (i.country_code || '').toUpperCase() === country);
    weight += inCountry ? paperWeight(w) : 0;
    if (isConsortium(w)) continue;
    counted += 1;
    if (me?.author_position === 'last' && auths.length > 1) {
      last += 1;
      const first = auths.find((a) => a.author_position === 'first');
      if (first?.author?.display_name) students.add(first.author.display_name);
    }
  }
  const sorted = [...mine].sort((a, b) =>
    String(b.publication_date || '').localeCompare(String(a.publication_date || '')),
  );
  // The candidate's own affiliation on their newest paper is fresher than last_known_institutions.
  let paperInst = null;
  for (const w of sorted) {
    const me = (w.authorships || []).find((a) => shortId(a.author?.id) === authorId);
    const insts = (me?.institutions || []).filter((i) => i.display_name);
    const inst = country ? insts.find((i) => (i.country_code || '').toUpperCase() === country) : insts[0];
    if (inst) {
      paperInst = { display_name: inst.display_name, country_code: inst.country_code, date: w.publication_date || null, year: w.publication_year || null };
      break;
    }
  }
  const hook = pickHookPaper(authorId, sorted);
  return {
    seen: mine.length,
    lastAuthor: last,
    lastAuthorShare: counted ? last / counted : 0,
    // Share of the raw on-topic count that is solo/small-lab work in the chosen country.
    volumeFactor: mine.length ? weight / mine.length : 1,
    students: [...students],
    latestDate: sorted[0]?.publication_date || null,
    paperInst,
    papers: sorted.slice(0, 5).map(paperOf),
    hookPaper: hook ? paperOf(hook) : null,
  };
}

export function scoreCandidate({ topicCount, hIndex, stats }, now = new Date()) {
  const volume = Math.min(1, (topicCount * (stats.volumeFactor ?? 1)) / 10);
  const seniority = Math.min(1, Math.log10((hIndex || 0) + 1) / 1.7); // h≈50 → 1
  // Too few papers seen to judge role or recency: score on volume and seniority
  // only, rescaled to at most 85 so well-evidenced PIs still rank first.
  if (stats.seen < 3) return Math.round(((40 * volume + 15 * seniority) / 55) * 85);
  const lab = Math.min(1, stats.students.length / 5);
  let recency = 0;
  if (stats.latestDate) {
    const months = (now - new Date(stats.latestDate)) / (1000 * 60 * 60 * 24 * 30.4);
    recency = months <= 12 ? 1 : months <= 24 ? 0.5 : 0.1;
  }
  const s = 40 * volume + 25 * stats.lastAuthorShare + 15 * seniority + 10 * lab + 10 * recency;
  return Math.round(s);
}

export function badges({ hIndex, worksCount, stats }) {
  const out = [];
  if (stats.seen < 3) return ['Limited paper data'];
  if (stats.lastAuthorShare >= 0.4 && hIndex >= 10) out.push('Likely PI');
  if (stats.students.length >= 3) out.push('Active lab');
  if (worksCount < 80 && hIndex < 25 && stats.lastAuthorShare >= 0.3) out.push('Rising PI');
  if (stats.lastAuthorShare < 0.15 && hIndex < 12) out.push('Possibly student/postdoc');
  return out;
}

// Countries where most faculty are "Dr", not "Prof." (UK-style academic titles).
const DR_COUNTRIES = new Set(['GB', 'IE', 'AU', 'NZ', 'CA']);
const shortTitle = (t, n = 70) => (t.length <= n ? t : t.slice(0, n).replace(/\s+\S*$/, '') + '…');

export function emailHook(p) {
  const paper = p.hookPaper || p.papers[0];
  const last = surname(p.name);
  const dr = DR_COUNTRIES.has(String(p.country || '').toUpperCase());
  const inst = p.institution ? (p.instConfirmed ? p.institution : `[confirm: ${p.institution}]`) : 'your institution';
  const subject = paper
    ? `Subject: Prospective PhD student ([term]): your work on "${shortTitle(paper.title)}"`
    : `Subject: Prospective PhD student ([term]): ${p.query}`;
  const read = paper
    ? `I read your ${paper.year ? paper.year + ' ' : 'recent '}paper "${paper.title}". [One specific sentence on the idea or result that stood out, and why.]`
    : 'I read your paper "[paper you read]". [One specific sentence on the idea or result that stood out, and why.]';
  return [
    subject,
    '',
    last ? `Dear ${dr ? 'Dr' : 'Prof.'} ${last},` : `Dear ${dr ? 'Dr' : 'Professor'} [Last name],`,
    '',
    `I am [your name], a [degree] student at [university], applying for PhD admission for [term]. Are you taking new PhD students in your group at ${inst}?`,
    '',
    read,
    '',
    '[One or two sentences on your most relevant project and its result.]',
    '',
    'My CV is attached. I would be grateful for a short reply, even if your group is full.',
    '',
    'Best regards,',
    '[Your name]',
    ...(dr ? ['', '(Check their title on their staff page: many UK/Commonwealth academics are "Dr" until promoted to Professor.)'] : []),
  ].join('\n');
}

// First unfilled [placeholder] in a draft, or null. Used to warn before copying.
export function firstPlaceholder(text) {
  const m = /\[[^\]\n]+\]/.exec(String(text || ''));
  return m ? { index: m.index, length: m[0].length, text: m[0] } : null;
}

const MONTH = 1000 * 60 * 60 * 24 * 30.4;
const CHUNK = 6; // author ids per step-3 request, so each gets ~15 of the 100 works
const LIMIT = 3; // concurrent requests

// Main entry point. Returns ranked advisor candidates for a research topic.
// The returned array also carries `partial` (some paper lookups failed) and,
// when empty, `reason` ('no_works' | 'filtered') plus `dropped` counts.
export async function findAdvisors(opts, deps) {
  const {
    query,
    country = '',
    years = 3,
    minH = 8,
    pool = 40,
    now = new Date(),
  } = opts;
  const { fetchJson, cfg = {}, onProgress = () => {} } = deps;
  if (!query || !query.trim()) throw new Error('Enter a research topic.');
  const q = filterQuery(query);
  if (!q) throw new Error('Enter a research topic.');
  const cc = country.trim().toUpperCase();
  const since = sinceDate(years, now);
  const done = (list, extra) => Object.assign(list, extra);

  // 1. Who publishes the most on this topic recently? Title/abstract match only:
  // full-text search lets passing mentions count.
  onProgress('Finding researchers active in this topic…');
  const topicFilters = [`title_and_abstract.search:${q}`, `from_publication_date:${since}`, 'is_retracted:false'];
  if (cc) topicFilters.push(`authorships.institutions.country_code:${cc}`);
  const groupUrl = (filters, page) =>
    buildUrl('/works', { filter: filters.join(','), group_by: 'authorships.author.id', per_page: 100, page }, cfg);
  const typed = [...topicFilters, 'type:article|preprint|review'];
  let filters = typed;
  const keep = (res) => (res.group_by || []).filter((g) => g.key && g.key !== 'unknown');
  let groups = keep(await fetchJson(groupUrl(filters)));
  if (!groups.length) {
    filters = topicFilters; // the type filter can drop conference papers in some fields
    groups = keep(await fetchJson(groupUrl(filters)));
  }
  if (!groups.length) return done([], { reason: 'no_works' });

  // 2. Author profiles: institution, h-index, career size.
  const topicCount = new Map();
  const authors = [];
  const dropped = { minH: 0, works: 0, institution: 0 };
  const loadAuthors = async (gs) => {
    for (const g of gs) topicCount.set(shortId(g.key), g.count);
    const pages = await mapLimit(chunk(gs.map((g) => shortId(g.key)), 50), LIMIT, (ids) =>
      fetchJson(
        buildUrl('/authors', {
          filter: `ids.openalex:${ids.join('|')}`,
          per_page: 50,
          select: 'id,display_name,orcid,works_count,cited_by_count,summary_stats,last_known_institutions',
        }, cfg),
      ),
    );
    for (const res of pages) authors.push(...(res.results || []));
  };
  const select = () => {
    for (const k of Object.keys(dropped)) dropped[k] = 0;
    return authors
      .map((a) => ({ a, inst: pickInstitution(a, cc) }))
      .filter(({ a, inst }) => {
        if (!inst) return dropped.institution++, false;
        if ((a.summary_stats?.h_index || 0) < minH) return dropped.minH++, false;
        if ((a.works_count || 0) < 15) return dropped.works++, false;
        return true;
      })
      .sort((x, y) => (topicCount.get(shortId(y.a.id)) ?? 0) - (topicCount.get(shortId(x.a.id)) ?? 0))
      .slice(0, pool);
  };
  onProgress(`Checking ${groups.length} author profiles…`);
  await loadAuthors(groups);
  let candidates = select();
  if (candidates.length < pool && groups.length >= 100) {
    // Backfill: the filters above removed too many of the top 100.
    try {
      const more = keep(await fetchJson(groupUrl(filters, 2))).filter((g) => !topicCount.has(shortId(g.key)));
      if (more.length) {
        await loadAuthors(more);
        candidates = select();
      }
    } catch {
      /* keep the first page */
    }
  }
  if (!candidates.length) return done([], { reason: 'filtered', dropped: { ...dropped } });

  // 3. Their recent on-topic papers, to detect PI role and lab size. Small
  // chunks so prolific co-authors can't crowd everyone else out of the page.
  onProgress('Reading recent papers to spot lab heads…');
  let partial = false;
  const worksFor = (ids, perPage) =>
    fetchJson(
      buildUrl('/works', {
        filter: [`title_and_abstract.search:${q}`, `author.id:${ids.join('|')}`, `from_publication_date:${since}`, 'is_retracted:false'].join(','),
        per_page: perPage,
        sort: 'publication_date:desc',
        select: 'id,doi,title,type,publication_year,publication_date,authorships,cited_by_count,is_authors_truncated',
      }, cfg),
    ).then(
      (res) => res.results || [],
      () => ((partial = true), []),
    );
  const byId = new Map();
  const add = (list) => list.forEach((w) => w?.id && !byId.has(w.id) && byId.set(w.id, w));
  const ids = candidates.map(({ a }) => shortId(a.id));
  (await mapLimit(chunk(ids, CHUNK), LIMIT, (part) => worksFor(part, 100))).forEach(add);
  // Top up authors who still have too few papers, one request each (max 8).
  const thin = ids
    .filter((id) => workStats(id, [...byId.values()]).seen < Math.min(topicCount.get(id) ?? 0, 10))
    .slice(0, 8);
  (await mapLimit(thin, LIMIT, (id) => worksFor([id], 25))).forEach(add);
  const works = [...byId.values()];

  onProgress('Ranking…');
  const list = candidates
    .map(({ a, inst }) => {
      const id = shortId(a.id);
      const stats = workStats(id, works, { country: cc });
      const hIndex = a.summary_stats?.h_index || 0;
      const pi = stats.paperInst;
      const fresh = !!(pi?.date && now - new Date(pi.date) <= 12 * MONTH);
      const base = {
        id,
        name: a.display_name,
        query,
        openalex: `https://openalex.org/${id}`,
        orcid: a.orcid || null,
        institution: pi ? pi.display_name : inst.display_name,
        country: pi?.country_code || inst.country_code,
        instSource: pi ? `seen on ${pi.year || 'recent'} paper` : 'OpenAlex profile',
        instConfirmed: fresh,
        hIndex,
        worksCount: a.works_count,
        citations: a.cited_by_count,
        topicCount: topicCount.get(id) || 0,
        lastAuthorShare: stats.lastAuthorShare,
        lowEvidence: stats.seen < 3,
        students: stats.students,
        latestDate: stats.latestDate,
        papers: stats.papers,
        hookPaper: stats.hookPaper,
      };
      base.score = scoreCandidate({ topicCount: base.topicCount, hIndex, stats }, now);
      base.badges = badges({ hIndex, worksCount: a.works_count, stats });
      return base;
    })
    .sort((x, y) => y.score - x.score);
  return done(list, { partial });
}

export function toCsv(rows) {
  const cols = ['score', 'name', 'institution', 'country', 'hIndex', 'topicCount', 'lastAuthorShare', 'latestDate', 'badges', 'latestPaper', 'latestPaperUrl', 'openalex', 'orcid'];
  const lines = [cols];
  for (const r of rows) {
    const rec = {
      ...r,
      lastAuthorShare: Math.round(r.lastAuthorShare * 100) + '%',
      badges: r.badges.join('; '),
      latestPaper: r.papers[0]?.title,
      latestPaperUrl: r.papers[0]?.url,
    };
    lines.push(cols.map((c) => rec[c]));
  }
  return csv(lines);
}
