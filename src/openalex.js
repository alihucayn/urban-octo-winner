// Advisor discovery on top of the OpenAlex API (https://openalex.org).
// Pure logic: everything that touches the network goes through `fetchJson`,
// so the scoring can be tested offline with fixtures.

export const BASE = 'https://api.openalex.org';

export function shortId(id) {
  return String(id || '').replace('https://openalex.org/', '');
}

export function buildUrl(path, params = {}, cfg = {}) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }
  if (cfg.apiKey) url.searchParams.set('api_key', cfg.apiKey);
  if (cfg.mailto) url.searchParams.set('mailto', cfg.mailto);
  return url.toString();
}

function sinceDate(years, now) {
  return `${now.getUTCFullYear() - years}-01-01`;
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function pickInstitution(author, country) {
  const insts = author.last_known_institutions || [];
  const academic = insts.filter((i) => i.type === 'education' || i.type === 'facility');
  const pool = academic.length ? academic : insts;
  if (!country) return pool[0] || null;
  return pool.find((i) => (i.country_code || '').toUpperCase() === country) || null;
}

// Aggregates the candidate's recent on-topic works into PI/lab signals.
export function workStats(authorId, works) {
  const mine = works.filter((w) =>
    (w.authorships || []).some((a) => shortId(a.author?.id) === authorId),
  );
  let last = 0;
  const students = new Set();
  for (const w of mine) {
    const auths = w.authorships || [];
    const me = auths.find((a) => shortId(a.author?.id) === authorId);
    if (me?.author_position === 'last' && auths.length > 1) {
      last += 1;
      const first = auths.find((a) => a.author_position === 'first');
      if (first?.author?.display_name) students.add(first.author.display_name);
    }
  }
  const sorted = [...mine].sort((a, b) =>
    String(b.publication_date || '').localeCompare(String(a.publication_date || '')),
  );
  return {
    seen: mine.length,
    lastAuthor: last,
    lastAuthorShare: mine.length ? last / mine.length : 0,
    students: [...students],
    latestDate: sorted[0]?.publication_date || null,
    papers: sorted.slice(0, 5).map((w) => ({
      title: w.title || w.display_name || '(untitled)',
      year: w.publication_year,
      date: w.publication_date,
      url: w.doi || w.id,
      citations: w.cited_by_count || 0,
    })),
  };
}

export function scoreCandidate({ topicCount, hIndex, stats }, now = new Date()) {
  const volume = Math.min(1, topicCount / 10);
  const seniority = Math.min(1, Math.log10((hIndex || 0) + 1) / 1.7); // h≈50 → 1
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
  if (stats.lastAuthorShare >= 0.4 && hIndex >= 10) out.push('Likely PI');
  if (stats.students.length >= 3) out.push('Active lab');
  if (worksCount < 80 && hIndex < 25 && stats.lastAuthorShare >= 0.3) out.push('Rising PI');
  if (stats.lastAuthorShare < 0.15 && hIndex < 12) out.push('Possibly student/postdoc');
  return out;
}

export function emailHook(p) {
  const paper = p.papers[0];
  if (!paper) return '';
  const surname = p.name.split(' ').slice(-1)[0];
  return [
    `Subject: Prospective PhD student — ${p.query}`,
    '',
    `Dear Prof. ${surname},`,
    '',
    `I read your ${paper.year} paper "${paper.title}". [One sentence on the specific idea or result that stood out to you, and why.]`,
    '',
    `[Two sentences on your most relevant project and what you found.]`,
    '',
    `I am applying for PhD admission for [term] and would love to work on [concrete question that extends the paper above]. Are you taking new students in your group at ${p.institution || 'your institution'}?`,
    '',
    'My CV is attached. Thank you for your time.',
    '',
    'Best regards,',
    '[Your name]',
  ].join('\n');
}

// Main entry point. Returns ranked advisor candidates for a research topic.
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
  const cc = country.trim().toUpperCase();
  const since = sinceDate(years, now);

  // 1. Who publishes the most on this topic recently?
  onProgress('Finding researchers active in this topic…');
  const filters = [`from_publication_date:${since}`];
  if (cc) filters.push(`authorships.institutions.country_code:${cc}`);
  const grouped = await fetchJson(
    buildUrl('/works', { search: query, filter: filters.join(','), group_by: 'authorships.author.id', per_page: 200 }, cfg),
  );
  const groups = (grouped.group_by || [])
    .filter((g) => g.key && g.key !== 'unknown')
    .slice(0, 100);
  const topicCount = new Map(groups.map((g) => [shortId(g.key), g.count]));
  if (!groups.length) return [];

  // 2. Author profiles: institution, h-index, career size.
  onProgress(`Checking ${groups.length} author profiles…`);
  const authors = [];
  for (const ids of chunk([...topicCount.keys()], 50)) {
    const res = await fetchJson(
      buildUrl('/authors', {
        filter: `ids.openalex:${ids.join('|')}`,
        per_page: 50,
        select: 'id,display_name,orcid,works_count,cited_by_count,summary_stats,last_known_institutions',
      }, cfg),
    );
    authors.push(...(res.results || []));
  }

  const candidates = authors
    .map((a) => ({ a, inst: pickInstitution(a, cc) }))
    .filter(({ a, inst }) => inst && (a.summary_stats?.h_index || 0) >= minH && a.works_count >= 15)
    .sort((x, y) => topicCount.get(shortId(y.a.id)) - topicCount.get(shortId(x.a.id)))
    .slice(0, pool);
  if (!candidates.length) return [];

  // 3. Their recent on-topic papers, to detect PI role and lab size.
  onProgress('Reading recent papers to spot lab heads…');
  const works = [];
  for (const ids of chunk(candidates.map(({ a }) => shortId(a.id)), 50)) {
    const res = await fetchJson(
      buildUrl('/works', {
        search: query,
        filter: `author.id:${ids.join('|')},from_publication_date:${since}`,
        per_page: 200,
        sort: 'publication_date:desc',
        select: 'id,doi,title,publication_year,publication_date,authorships,cited_by_count',
      }, cfg),
    );
    works.push(...(res.results || []));
  }

  onProgress('Ranking…');
  return candidates
    .map(({ a, inst }) => {
      const id = shortId(a.id);
      const stats = workStats(id, works);
      const hIndex = a.summary_stats?.h_index || 0;
      const base = {
        id,
        name: a.display_name,
        query,
        openalex: `https://openalex.org/${id}`,
        orcid: a.orcid || null,
        institution: inst.display_name,
        country: inst.country_code,
        hIndex,
        worksCount: a.works_count,
        citations: a.cited_by_count,
        topicCount: topicCount.get(id) || 0,
        lastAuthorShare: stats.lastAuthorShare,
        students: stats.students,
        latestDate: stats.latestDate,
        papers: stats.papers,
      };
      base.score = scoreCandidate({ topicCount: base.topicCount, hIndex, stats }, now);
      base.badges = badges({ hIndex, worksCount: a.works_count, stats });
      return base;
    })
    .sort((x, y) => y.score - x.score);
}

export function toCsv(rows) {
  const cols = ['score', 'name', 'institution', 'country', 'hIndex', 'topicCount', 'lastAuthorShare', 'latestDate', 'badges', 'latestPaper', 'latestPaperUrl', 'openalex', 'orcid'];
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(',')];
  for (const r of rows) {
    const rec = {
      ...r,
      lastAuthorShare: Math.round(r.lastAuthorShare * 100) + '%',
      badges: r.badges.join('; '),
      latestPaper: r.papers[0]?.title,
      latestPaperUrl: r.papers[0]?.url,
    };
    lines.push(cols.map((c) => esc(rec[c])).join(','));
  }
  return lines.join('\n');
}
