// fetch wrapper for OpenAlex: timeout, bounded retry and typed errors.
// `fetch`, `sleep` and `cache` are injectable so this runs under node:test.

export const MESSAGES = {
  network: "Couldn't reach OpenAlex. Check your connection.",
  rate: 'The free OpenAlex data budget for your network is used up. It resets at 00:00 UTC (05:00 PKT).',
  auth: 'OpenAlex rejected the API key. Remove or fix the key.',
  server: 'OpenAlex is having trouble. Retry in a minute.',
  bad: 'Topic query not understood. Simplify the wording.',
};

export class ApiError extends Error {
  constructor(kind, status) {
    super(MESSAGES[kind] || MESSAGES.server);
    this.kind = kind;
    this.status = status;
  }
}

export const retryable = (kind) => kind === 'network' || kind === 'server' || kind === 'rate';

export function classify(status) {
  if (status === 429) return 'rate';
  if (status === 401 || status === 403) return 'auth';
  if (status >= 500) return 'server';
  return 'bad';
}

export function makeFetchJson({
  fetch = globalThis.fetch,
  timeoutMs = 15000,
  retries = 2,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  cache = null, // { get(url), set(url, data) }
} = {}) {
  async function once(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await fetch(url, { signal: ctrl.signal });
    } catch {
      throw new ApiError('network'); // TypeError ("Failed to fetch") or AbortError (timeout)
    } finally {
      clearTimeout(timer);
    }
  }

  return async function fetchJson(url) {
    const hit = cache?.get(url);
    if (hit) return hit;
    let rateRetried = false;
    for (let attempt = 0; ; attempt++) {
      let err;
      try {
        const res = await once(url);
        if (res.ok) {
          const data = await res.json();
          cache?.set(url, data);
          return data;
        }
        err = new ApiError(classify(res.status), res.status);
        if (err.kind === 'rate') {
          // Retry once on a short Retry-After; otherwise it is the daily budget.
          const wait = Number(res.headers?.get?.('Retry-After'));
          if (!rateRetried && wait > 0 && wait <= 5) {
            rateRetried = true;
            await sleep(wait * 1000);
            attempt--;
            continue;
          }
          throw err;
        }
        if (err.kind !== 'server') throw err;
      } catch (e) {
        if (!(e instanceof ApiError) || (e.kind !== 'network' && e.kind !== 'server')) throw e;
        err = e;
      }
      if (attempt >= retries) throw err;
      await sleep(400 * 2 ** attempt + Math.random() * 300);
    }
  };
}

// Persistent response cache for fetchJson: localStorage, `ttlMs` expiry and a
// least-recently-used cap of `max` entries. Quota errors evict and retry once.
export function makeStorageCache({ storage, ttlMs = 7 * 86400000, max = 60, prefix = 'as.oa:', now = () => Date.now() } = {}) {
  const IDX = prefix + 'idx';
  const index = () => {
    try {
      const v = JSON.parse(storage.getItem(IDX) || '[]');
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };
  const saveIndex = (idx) => {
    try {
      storage.setItem(IDX, JSON.stringify(idx));
    } catch {
      /* ignore */
    }
  };
  const drop = (idx, url) => {
    try {
      storage.removeItem(prefix + url);
    } catch {
      /* ignore */
    }
    return idx.filter((u) => u !== url);
  };
  return {
    get(url) {
      let e;
      try {
        e = JSON.parse(storage.getItem(prefix + url) || 'null');
      } catch {
        e = null;
      }
      let idx = index();
      if (!e || now() - e.t > ttlMs) {
        if (e) saveIndex(drop(idx, url));
        return null;
      }
      saveIndex([...idx.filter((u) => u !== url), url]);
      return e.d;
    },
    set(url, data) {
      let idx = index().filter((u) => u !== url);
      while (idx.length >= max) idx = drop(idx, idx[0]);
      const value = JSON.stringify({ t: now(), d: data });
      for (let tries = 0; tries < 2; tries++) {
        try {
          storage.setItem(prefix + url, value);
          saveIndex([...idx, url]);
          return;
        } catch {
          // Quota: free the oldest half and try once more.
          for (const u of idx.slice(0, Math.ceil(idx.length / 2))) idx = drop(idx, u);
        }
      }
      saveIndex(idx);
    },
  };
}
