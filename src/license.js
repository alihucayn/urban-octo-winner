// License-key unlock. Keys are checked against the payment provider's public
// license API from the browser and the result is cached for a week.
import { CONFIG } from './config.js';

const KEY = 'as.license';
const WEEK = 7 * 24 * 60 * 60 * 1000;

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}

function save(v) {
  try {
    if (v) localStorage.setItem(KEY, JSON.stringify(v));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: unlock lasts for this page view only */
  }
}

async function postForm(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  return res.json();
}

function lemonOk(data) {
  if (!data) return false;
  const ok = data.valid === true || data.activated === true;
  const status = data.license_key?.status;
  if (!ok || status === 'disabled' || status === 'expired') return false;
  if (CONFIG.lemonStoreId && data.meta?.store_id !== CONFIG.lemonStoreId) return false;
  if (CONFIG.lemonProductId && data.meta?.product_id !== CONFIG.lemonProductId) return false;
  return true;
}

async function check(key, instanceId) {
  const p = CONFIG.licenseProvider;
  if (p === 'none') return { ok: true };
  if (p === 'gumroad') {
    const d = await postForm('https://api.gumroad.com/v2/licenses/verify', {
      product_id: CONFIG.gumroadProductId,
      license_key: key,
      increment_uses_count: instanceId ? 'false' : 'true',
    });
    const bad = !d.success || d.purchase?.refunded || d.purchase?.chargebacked || d.purchase?.disputed;
    return { ok: !bad, instanceId: 'gumroad' };
  }
  const base = 'https://api.lemonsqueezy.com/v1/licenses/';
  if (instanceId) {
    const d = await postForm(base + 'validate', { license_key: key, instance_id: instanceId });
    return { ok: lemonOk(d), instanceId };
  }
  const d = await postForm(base + 'activate', { license_key: key, instance_name: navigator.userAgent.slice(0, 60) });
  return { ok: lemonOk(d), instanceId: d.instance?.id, error: d.error };
}

export async function activate(key) {
  key = key.trim();
  if (!key) return { ok: false, error: 'Paste your license key.' };
  try {
    const r = await check(key);
    if (!r.ok) return { ok: false, error: r.error || 'That key was not accepted.' };
    save({ key, instanceId: r.instanceId, checkedAt: Date.now() });
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not reach the license server. Try again.' };
  }
}

export function isPro() {
  return !!load();
}

// Re-checks once a week; a network failure keeps the unlock (offline grace).
export async function refresh() {
  const lic = load();
  if (!lic || Date.now() - lic.checkedAt < WEEK) return !!lic;
  try {
    const r = await check(lic.key, lic.instanceId);
    if (!r.ok) {
      save(null);
      return false;
    }
    save({ ...lic, checkedAt: Date.now() });
  } catch {
    /* keep */
  }
  return true;
}

export function deactivate() {
  save(null);
}
