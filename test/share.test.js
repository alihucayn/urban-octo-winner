import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSearch, searchParams, whatsappUrl, attribution, regionalOffer, checkoutUrl } from '../src/share.js';

const allowed = { countries: ['US', 'GB'], years: [2, 3, 5], minH: [5, 8, 15, 25] };

test('parseSearch validates every value against the form options', () => {
  assert.deepEqual(parseSearch('?q=%20graph%20%20learning%20&country=gb&years=5&minH=15', allowed), { q: 'graph learning', country: 'GB', years: 5, minH: 15 });
  assert.deepEqual(parseSearch('?q=x&country=ZZ&years=4&minH=1e3', allowed), { q: 'x', country: '', years: null, minH: null });
  assert.equal(parseSearch('', allowed).q, '');
  assert.equal(parseSearch('?q=' + 'a'.repeat(500), allowed).q.length, 200);
});

test('searchParams round-trips and drops empty values', () => {
  const qs = searchParams({ query: 'LLM safety', country: '', years: 3, minH: 8 });
  assert.equal(qs, 'q=LLM+safety&years=3&minH=8');
  assert.deepEqual(parseSearch(qs, allowed), { q: 'LLM safety', country: '', years: 3, minH: 8 });
});

test('whatsappUrl encodes the message', () => {
  const u = whatsappUrl('robots & AI', 'Germany', 'https://x.test/?q=a');
  assert.ok(u.startsWith('https://wa.me/?text='));
  assert.equal(decodeURIComponent(u.split('=').slice(1).join('=')), 'Professors actively publishing on robots & AI in Germany: https://x.test/?q=a');
});

test('attribution keeps a valid code for 30 days', () => {
  const now = 1_000_000_000_000;
  assert.deepEqual(attribution('?code=nustsoc', null, now), { code: 'NUSTSOC', at: now });
  assert.equal(attribution('?code=bad%20code', null, now), null);
  const saved = { code: 'NUSTSOC', at: now };
  assert.deepEqual(attribution('', saved, now + 29 * 86400000), saved);
  assert.equal(attribution('', saved, now + 31 * 86400000), null);
});

test('regionalOffer matches by time zone only', () => {
  const offers = [{ code: 'SOUTHASIA', priceLabel: '$8', timezones: ['Asia/Karachi'] }];
  assert.equal(regionalOffer(offers, 'Asia/Karachi').code, 'SOUTHASIA');
  assert.equal(regionalOffer(offers, 'Europe/London'), null);
  assert.equal(regionalOffer([], 'Asia/Karachi'), null);
});

test('checkoutUrl adds source and discount for Lemon Squeezy and refuses placeholders', () => {
  const u = new URL(checkoutUrl('https://s.lemonsqueezy.com/buy/abc', { provider: 'lemonsqueezy', channel: 'hn', code: 'NUSTSOC' }));
  assert.equal(u.searchParams.get('checkout[custom][source]'), 'hn');
  assert.equal(u.searchParams.get('checkout[discount_code]'), 'NUSTSOC');
  assert.equal(checkoutUrl('https://g.gumroad.com/l/x', { provider: 'gumroad', channel: 'hn' }), 'https://g.gumroad.com/l/x');
  assert.equal(checkoutUrl('https://YOUR-STORE.lemonsqueezy.com/buy/REPLACE-ME', {}), null);
  assert.equal(checkoutUrl('not a url', {}), null);
});
