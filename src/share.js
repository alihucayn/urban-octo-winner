// Pure helpers for shareable search links, sale attribution and checkout URLs.
// No DOM access here, so everything is unit tested (test/share.test.js).

const ATTR_DAYS = 30;
const CODE = /^[A-Za-z0-9_-]{1,32}$/;

const intIn = (v, allowed) => {
  if (!/^\d{1,3}$/.test(String(v ?? ''))) return null;
  const n = Number(v);
  return allowed.includes(n) ? n : null;
};

// Reads ?q=&country=&years=&minH= and keeps only values the form can show.
// `allowed` = { countries: ['US', ...], years: [2,3,5], minH: [5,8,15,25] }.
export function parseSearch(search, allowed) {
  const p = new URLSearchParams(search || '');
  const q = String(p.get('q') || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const country = String(p.get('country') || '').toUpperCase();
  return {
    q,
    country: allowed.countries.includes(country) ? country : '',
    years: intIn(p.get('years'), allowed.years),
    minH: intIn(p.get('minH'), allowed.minH),
  };
}

// The inverse, for history.replaceState and share links. Empty values are left out.
export function searchParams({ query, country, years, minH }) {
  const p = new URLSearchParams();
  if (query) p.set('q', query);
  if (country) p.set('country', country);
  if (years) p.set('years', String(years));
  if (minH) p.set('minH', String(minH));
  return p.toString();
}

export function whatsappUrl(query, countryName, link) {
  const text = `Professors actively publishing on ${query}${countryName ? ` in ${countryName}` : ''}: ${link}`;
  return 'https://wa.me/?text=' + encodeURIComponent(text);
}

// Discount code from ?code=, kept for 30 days so a later visit still gets it.
// `saved` is the stored { code, at } or null. Returns what to store and use.
export function attribution(search, saved, now = Date.now()) {
  const p = new URLSearchParams(search || '');
  const code = p.get('code');
  if (code && CODE.test(code)) return { code: code.toUpperCase(), at: now };
  if (saved && CODE.test(saved.code || '') && now - (saved.at || 0) < ATTR_DAYS * 86400000) return saved;
  return null;
}

// Regional offer chosen by the browser's time zone (no IP lookup, nothing sent anywhere).
export function regionalOffer(offers, timeZone) {
  if (!Array.isArray(offers) || !timeZone) return null;
  return offers.find((o) => o && CODE.test(o.code || '') && (o.timezones || []).includes(timeZone)) || null;
}

// Lemon Squeezy checkout link with the sale's channel and discount code attached.
// Affiliate (?aff=) credit is left to Lemon Squeezy's own affiliate.js.
export function checkoutUrl(base, { provider, channel, code } = {}) {
  if (!base || /REPLACE-ME|YOUR-STORE/i.test(base)) return null;
  let u;
  try {
    u = new URL(base);
  } catch {
    return null;
  }
  if (provider === 'lemonsqueezy') {
    if (channel) u.searchParams.set('checkout[custom][source]', channel);
    if (code) u.searchParams.set('checkout[discount_code]', code);
  }
  return u.toString();
}
