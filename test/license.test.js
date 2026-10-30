import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
let reply;
globalThis.fetch = async () => {
  if (reply instanceof Error) throw reply;
  return { status: reply.status, json: async () => (reply.body === undefined ? Promise.reject(new SyntaxError('x')) : reply.body) };
};

const { CONFIG } = await import('../src/config.js');
const license = await import('../src/license.js');

const meta = { store_id: 11, product_id: 22 };
const OLD = { key: 'K', instanceId: 'i1', checkedAt: 0 };

beforeEach(() => {
  mem.clear();
  Object.assign(CONFIG, { licenseProvider: 'lemonsqueezy', lemonStoreId: 11, lemonProductId: 22, gumroadProductId: 'gp' });
});

test('activation succeeds only for this store and product', async () => {
  reply = { status: 200, body: { activated: true, meta, instance: { id: 'i9' }, license_key: { status: 'active' } } };
  assert.deepEqual(await license.activate('K'), { ok: true });
  assert.equal(JSON.parse(mem.get('as.license')).instanceId, 'i9');
  mem.clear();
  reply = { status: 200, body: { activated: true, meta: { store_id: 99, product_id: 22 }, instance: { id: 'x' } } };
  const r = await license.activate('K');
  assert.equal(r.ok, false);
  assert.equal(r.kind, 'wrong_product');
  assert.ok(!license.isPro());
});

test('fails closed when store/product ids are not configured', async () => {
  CONFIG.lemonStoreId = null;
  reply = { status: 200, body: { activated: true, meta, instance: { id: 'x' } } };
  const r = await license.activate('K');
  assert.equal(r.ok, false);
  assert.equal(r.kind, 'config');
});

test('activation limit gets a clear message', async () => {
  reply = { status: 400, body: { activated: false, error: 'This license key has reached the activation limit.', meta, license_key: { activation_limit: 3 } } };
  const r = await license.activate('K');
  assert.equal(r.kind, 'limit');
  assert.match(r.error, /active on 3 devices/);
});

for (const [name, rep] of [
  ['429 with JSON body', { status: 429, body: { error: 'Too many' } }],
  ['503 with JSON body', { status: 503, body: { valid: false } }],
  ['non-JSON body', { status: 200, body: undefined }],
  ['network TypeError', new TypeError('Failed to fetch')],
]) {
  test(`refresh keeps the unlock on a transient ${name}`, async () => {
    mem.set('as.license', JSON.stringify(OLD));
    reply = rep;
    assert.equal(await license.refresh(), true);
    assert.equal(JSON.parse(mem.get('as.license')).checkedAt, 0);
  });
}

test('refresh revokes on a definitive valid:false', async () => {
  mem.set('as.license', JSON.stringify(OLD));
  reply = { status: 404, body: { valid: false, error: 'license_key not found.', meta: null } };
  assert.equal(await license.refresh(), false);
  assert.ok(!license.isPro());
});

test('refresh updates checkedAt on success', async () => {
  mem.set('as.license', JSON.stringify(OLD));
  reply = { status: 200, body: { valid: true, meta, license_key: { status: 'active' } } };
  assert.equal(await license.refresh(), true);
  assert.ok(JSON.parse(mem.get('as.license')).checkedAt > 0);
});

test('gumroad rejects refunded purchases and unknown keys', async () => {
  CONFIG.licenseProvider = 'gumroad';
  reply = { status: 200, body: { success: true, purchase: { refunded: true } } };
  assert.equal((await license.activate('K')).ok, false);
  reply = { status: 404, body: { success: false } };
  assert.equal((await license.activate('K')).kind, 'rejected');
  reply = { status: 200, body: { success: true, purchase: {} } };
  assert.equal((await license.activate('K')).ok, true);
  CONFIG.gumroadProductId = '';
  assert.equal((await license.activate('K')).kind, 'config');
});

test("'none' mode only unlocks on localhost", async () => {
  CONFIG.licenseProvider = 'none';
  assert.equal((await license.activate('K')).ok, false);
  globalThis.location = { hostname: 'localhost' };
  assert.equal((await license.activate('K')).ok, true);
  delete globalThis.location;
});

test('deactivate frees the slot and forgets the key', async () => {
  mem.set('as.license', JSON.stringify(OLD));
  reply = { status: 200, body: { deactivated: true } };
  assert.deepEqual(await license.deactivate(), { freed: true });
  assert.ok(!license.isPro());
});

test('gumroad caps first activations at activationLimit uses', async () => {
  CONFIG.licenseProvider = 'gumroad';
  CONFIG.activationLimit = 3;
  reply = { status: 200, body: { success: true, uses: 4, purchase: {} } };
  assert.equal((await license.activate('K')).kind, 'limit');
  reply = { status: 200, body: { success: true, uses: 3, purchase: {} } };
  assert.equal((await license.activate('K')).ok, true);
  // Weekly re-checks don't increment uses, so a high count never revokes an existing unlock.
  mem.set('as.license', JSON.stringify({ key: 'K', instanceId: 'gumroad', checkedAt: 0 }));
  reply = { status: 200, body: { success: true, uses: 9, purchase: {} } };
  assert.equal(await license.refresh(), true);
  CONFIG.activationLimit = 5;
});

test('isPro ignores tampered or malformed stored licenses', () => {
  mem.set('as.license', JSON.stringify({ checkedAt: 9e15 }));
  assert.equal(license.isPro(), false);
  mem.set('as.license', JSON.stringify({ key: 'K', checkedAt: Date.now() + 86400000 }));
  assert.equal(license.isPro(), false);
  mem.set('as.license', JSON.stringify(OLD));
  assert.equal(license.isPro(), true);
});
