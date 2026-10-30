import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeFetchJson, makeStorageCache, ApiError, classify } from '../src/http.js';
import { dueDate, isOverdue, localToday, validateBackup, mergeBackup, trackerCsv } from '../src/tracker.js';
import { csvCell } from '../src/csv.js';
import { validateConfig } from '../src/validate-config.js';

const res = (status, body = {}, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (k) => headers[k] ?? null },
  json: async () => body,
});
const noSleep = async () => {};

// ---------- http ----------
test('fetchJson retries 5xx and network errors, then succeeds', async () => {
  const seq = [res(503), Promise.reject(new TypeError('Failed to fetch')), res(200, { ok: 1 })];
  let n = 0;
  const f = makeFetchJson({ fetch: async () => seq[n++], sleep: noSleep });
  assert.deepEqual(await f('u'), { ok: 1 });
  assert.equal(n, 3);
});

test('fetchJson gives up after two retries with a typed error', async () => {
  let n = 0;
  const f = makeFetchJson({ fetch: async () => (n++, res(500)), sleep: noSleep });
  await assert.rejects(f('u'), (e) => e instanceof ApiError && e.kind === 'server');
  assert.equal(n, 3);
});

test('fetchJson does not retry 400/401, and retries 429 once only on a short Retry-After', async () => {
  for (const [status, kind] of [[400, 'bad'], [401, 'auth'], [403, 'auth']]) {
    let n = 0;
    const f = makeFetchJson({ fetch: async () => (n++, res(status)), sleep: noSleep });
    await assert.rejects(f('u'), (e) => e.kind === kind);
    assert.equal(n, 1);
  }
  let n = 0;
  const f = makeFetchJson({ fetch: async () => (n++, res(429, {}, { 'Retry-After': '2' })), sleep: noSleep });
  await assert.rejects(f('u'), (e) => e.kind === 'rate');
  assert.equal(n, 2);
  n = 0;
  const g = makeFetchJson({ fetch: async () => (n++, res(429)), sleep: noSleep });
  await assert.rejects(g('u'), (e) => e.kind === 'rate');
  assert.equal(n, 1);
});

test('fetchJson times out a stalled request as a network error', async () => {
  const f = makeFetchJson({
    timeoutMs: 20,
    retries: 0,
    fetch: (url, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))),
  });
  await assert.rejects(f('u'), (e) => e.kind === 'network');
});

test('fetchJson uses the cache', async () => {
  const mem = new Map([['u', { cached: true }]]);
  const f = makeFetchJson({ fetch: async () => assert.fail('network'), cache: { get: (k) => mem.get(k), set: (k, v) => mem.set(k, v) } });
  assert.deepEqual(await f('u'), { cached: true });
  assert.equal(classify(502), 'server');
});

test('storage cache expires after the TTL and evicts least recently used', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  let t = 0;
  const c = makeStorageCache({ storage, ttlMs: 100, max: 2, now: () => t });
  c.set('a', { a: 1 });
  c.set('b', { b: 1 });
  assert.deepEqual(c.get('a'), { a: 1 }); // a is now most recent
  c.set('c', { c: 1 }); // evicts b
  assert.equal(c.get('b'), null);
  assert.deepEqual(c.get('a'), { a: 1 });
  t = 101;
  assert.equal(c.get('c'), null);
});

test('storage cache survives a full quota', () => {
  const mem = new Map();
  let full = true;
  const storage = {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => {
      if (full && k.endsWith('big')) {
        full = false;
        throw new DOMException('quota', 'QuotaExceededError');
      }
      mem.set(k, String(v));
    },
    removeItem: (k) => mem.delete(k),
  };
  const c = makeStorageCache({ storage });
  c.set('old', 1);
  c.set('big', 2);
  assert.equal(c.get('old'), null);
  assert.equal(c.get('big'), 2);
});

// ---------- tracker dates (run in Berlin and Karachi) ----------
test('dueDate is DST-safe and today is local', () => {
  assert.equal(dueDate('2026-03-20'), '2026-03-30');
  assert.equal(dueDate('2026-12-28'), '2027-01-07');
  assert.equal(dueDate(''), '');
  assert.equal(localToday(new Date(2026, 0, 5, 0, 30)), '2026-01-05');
  assert.ok(isOverdue({ emailed: '2026-10-01', status: 'Emailed' }, '2026-10-11'));
  assert.ok(!isOverdue({ emailed: '2026-10-01', status: 'Replied' }, '2026-10-30'));
});

test('date helpers agree across time zones', () => {
  const here = fileURLToPath(import.meta.url);
  const script = `import('${new URL('../src/tracker.js', import.meta.url).href}').then(m => process.stdout.write(m.dueDate('2026-03-20') + ' ' + m.localToday(new Date(2026, 2, 29, 0, 30))))`;
  for (const TZ of ['Europe/Berlin', 'Asia/Karachi', 'America/New_York']) {
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ }, cwd: here.replace(/[^/]+$/, '') });
    assert.equal(String(out), '2026-03-30 2026-03-29', TZ);
  }
});

test('backup validation rejects junk and merge replaces by id', () => {
  assert.throws(() => validateBackup({ foo: 1 }), /Not an AdvisorScout backup/);
  assert.throws(() => validateBackup([{ name: 'x' }]), /missing an id/);
  const rows = validateBackup({ shortlist: [{ id: 'A1', name: 'Ada', status: 'bogus', emailed: 'yesterday', notes: 3 }] });
  assert.deepEqual(rows[0], { id: 'A1', name: 'Ada', institution: '', topic: '', paper: null, status: 'To contact', emailed: '', notes: '' });
  const merged = mergeBackup([{ id: 'A1', name: 'old' }, { id: 'A2', name: 'keep' }], rows);
  assert.deepEqual(merged.map((r) => r.name), ['Ada', 'keep']);
});

test('csv cells guard formulas and quote line breaks', () => {
  assert.equal(csvCell('=1+1'), "'=1+1");
  assert.equal(csvCell('-x'), "'-x");
  assert.equal(csvCell('a\nb'), '"a\nb"');
  assert.equal(csvCell(null), '');
  const out = trackerCsv([{ name: '@me', institution: 'U', status: 'Emailed', emailed: '2026-01-01', notes: '' }]);
  assert.ok(out.startsWith('﻿name,'));
  assert.match(out, /\r\n'@me,U,,Emailed,2026-01-01,2026-01-11,,/);
});

// ---------- config ----------
test('validateConfig blocks placeholder checkout, none mode, missing ids and public keys', () => {
  const ok = { checkoutUrl: 'https://s.lemonsqueezy.com/buy/abc', licenseProvider: 'lemonsqueezy', lemonStoreId: 1, lemonProductId: 2, openalex: { apiKey: '' } };
  assert.deepEqual(validateConfig(ok), []);
  assert.equal(validateConfig({ ...ok, checkoutUrl: 'https://YOUR-STORE.lemonsqueezy.com/buy/REPLACE-ME' }).length, 1);
  assert.equal(validateConfig({ ...ok, licenseProvider: 'none' }).length, 1);
  assert.equal(validateConfig({ ...ok, lemonStoreId: null, lemonProductId: null }).length, 2);
  assert.equal(validateConfig({ ...ok, licenseProvider: 'gumroad' }).length, 1);
  assert.equal(validateConfig({ ...ok, openalex: { apiKey: 'secret' } }).length, 1);
});
