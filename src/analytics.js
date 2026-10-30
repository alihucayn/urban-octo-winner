// Cookieless funnel analytics. Only allowlisted event names and properties
// with short enum values are sent: never topics, keys, emails or notes.
import { CONFIG } from './config.js';

const EVENTS = {
  search: ['bucket', 'paywalled', 'error', 'channel'],
  paywall_view: ['source', 'channel'],
  upgrade_click: ['source', 'channel'],
  checkout_click: ['source', 'channel'],
  license_activate: ['ok', 'error_kind', 'channel'],
  pro_feature_used: ['feature', 'channel'],
  share: ['method', 'channel'],
  signup: ['channel'],
};
const SAFE = /^[a-z0-9_-]{1,32}$/;
let provider = 'none';

export function sanitize(v) {
  const s = String(v ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32);
  return SAFE.test(s) ? s : '';
}

// First-touch channel from ?utm_source= or ?ref=, kept per browser.
export function channel() {
  try {
    let c = localStorage.getItem('as.channel');
    if (c === null) {
      const p = new URLSearchParams(location.search);
      c = sanitize(p.get('utm_source') || p.get('ref')) || 'direct';
      localStorage.setItem('as.channel', c);
    }
    return c;
  } catch {
    return 'direct';
  }
}

export function pick(name, props = {}) {
  const keys = EVENTS[name];
  if (!keys) return null;
  const out = {};
  for (const k of keys) {
    const v = props[k];
    if (typeof v === 'boolean') out[k] = v;
    else if (v !== undefined && v !== null && sanitize(v)) out[k] = sanitize(v);
  }
  return out;
}

export function init() {
  try {
    const { provider: p, siteId } = CONFIG.analytics || {};
    if (!siteId || p === 'none' || navigator.globalPrivacyControl) return;
    const s = document.createElement('script');
    s.async = true;
    if (p === 'umami') {
      s.src = 'https://cloud.umami.is/script.js';
      s.dataset.websiteId = siteId;
    } else if (p === 'goatcounter') {
      s.src = 'https://gc.zgo.at/count.js';
      s.dataset.goatcounter = `https://${siteId}.goatcounter.com/count`;
    } else return;
    document.head.appendChild(s);
    provider = p;
  } catch {
    /* analytics must never break the app */
  }
}

export function track(name, props = {}) {
  try {
    if (provider === 'none') return;
    const data = pick(name, { ...props, channel: channel() });
    if (!data) return;
    if (provider === 'umami') window.umami?.track(name, data);
    if (provider === 'goatcounter') {
      const path = [name, ...Object.entries(data).map(([k, v]) => `${k}-${v}`)].join('/');
      window.goatcounter?.count({ path, title: name, event: true });
    }
  } catch {
    /* ignore */
  }
}
