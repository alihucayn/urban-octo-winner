// Cloudflare Worker (free tier) in front of OpenAlex.
// - Holds the OpenAlex API key as a secret (never in src/config.js).
// - Forwards only GET /works and /authors with allowlisted params.
// - Caches responses for 24h, so repeated topics cost nothing.
// - Caps uncached upstream calls per IP per day (approximate: counted per Cloudflare
//   location via the Cache API). One AdvisorScout search is ~8-15 upstream calls.
//
// Deploy: npx wrangler deploy worker/openalex-proxy.js --name advisorscout-api
//         npx wrangler secret put OPENALEX_KEY
//         set vars ALLOWED_ORIGIN (e.g. https://you.github.io) and MAILTO in the dashboard,
//         then set CONFIG.openalex.proxy to the Worker URL (free visitors fall back to it
//         on a 429; Pro always uses it).

const PATHS = new Set(['/works', '/authors']);
const PARAMS = ['search', 'filter', 'group_by', 'per_page', 'select', 'sort', 'page'];
const DAY = 86400;
const MAX_UPSTREAM_PER_IP = 400; // ~30 searches/day; campus NAT shares an IP, so keep it generous

function cors(env, extra = {}) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET',
    Vary: 'Origin',
    ...extra,
  };
}

const json = (env, status, body) =>
  new Response(JSON.stringify(body), { status, headers: cors(env, { 'Content-Type': 'application/json' }) });

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors(env) });
    const url = new URL(request.url);
    if (request.method !== 'GET' || !PATHS.has(url.pathname)) return json(env, 404, { error: 'not found' });

    // Normalised cache key: allowlisted params in a fixed order, no credentials.
    const clean = new URL('https://api.openalex.org' + url.pathname);
    for (const k of PARAMS) {
      const v = url.searchParams.get(k);
      if (v) clean.searchParams.set(k, v.slice(0, 2000));
    }
    const cache = caches.default;
    const cacheKey = new Request(clean.toString());
    const hit = await cache.match(cacheKey);
    if (hit) return new Response(hit.body, { status: hit.status, headers: cors(env, { 'Content-Type': 'application/json', 'X-Cache': 'HIT' }) });

    // Per-IP daily budget, counted only for upstream (uncached) calls.
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const day = new Date().toISOString().slice(0, 10);
    const counterKey = new Request(`https://rate.internal/${day}/${encodeURIComponent(ip)}`);
    const used = Number((await (await cache.match(counterKey))?.text()) || 0);
    if (used >= MAX_UPSTREAM_PER_IP) return json(env, 429, { error: 'daily limit' });
    ctx.waitUntil(cache.put(counterKey, new Response(String(used + 1), { headers: { 'Cache-Control': `max-age=${DAY}` } })));

    const upstream = new URL(clean);
    if (env.OPENALEX_KEY) upstream.searchParams.set('api_key', env.OPENALEX_KEY);
    if (env.MAILTO) upstream.searchParams.set('mailto', env.MAILTO);
    const res = await fetch(upstream.toString(), { headers: { Accept: 'application/json' } });
    const body = await res.text();
    if (res.ok) {
      ctx.waitUntil(cache.put(cacheKey, new Response(body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${DAY}` } })));
    }
    // A 429 from OpenAlex means the owner's daily budget is spent: pass it through.
    return new Response(body, { status: res.status, headers: cors(env, { 'Content-Type': 'application/json', 'X-Cache': 'MISS' }) });
  },
};
