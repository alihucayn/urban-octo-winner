// License-key unlock. Keys are checked against the payment provider's public
// license API from the browser and the result is cached for a week.
// This is an honor-system gate: anyone with devtools can bypass it. It only
// has to be fair to honest buyers: never revoke on a flaky network.
import { CONFIG } from './config.js';

const KEY = 'as.license';
const WEEK = 7 * 24 * 60 * 60 * 1000;
const LEMON = 'https://api.lemonsqueezy.com/v1/licenses/';

// Light shape check only: stops a casual `{checkedAt: 9e15}` edit, not a determined user.
function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    return v && typeof v.key === 'string' && v.key && Number(v.checkedAt) <= Date.now() ? v : null;
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

// Network errors (TypeError, CORS) propagate; a non-JSON body gives data null.
async function postForm(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* not JSON */
  }
  return { status: res.status, data };
}

const definitive = (status) => status === 200 || status === 400 || status === 404 || status === 422;
const isLocal = () => ['localhost', '127.0.0.1'].includes(globalThis.location?.hostname);

// Outcome of one license call: 'ok' | 'invalid' (revoke/reject) | 'transient' (keep, retry later).
export function classifyLemon({ status, data }) {
  if (!CONFIG.lemonStoreId || !CONFIG.lemonProductId) return { result: 'invalid', kind: 'config', error: 'License check is not configured yet. Please email support.' };
  if (!data || !definitive(status)) return { result: 'transient' };
  const meta = data.meta || {};
  if (meta.store_id !== undefined && Number(meta.store_id) !== Number(CONFIG.lemonStoreId)) return { result: 'invalid', kind: 'wrong_product' };
  if (meta.product_id !== undefined && Number(meta.product_id) !== Number(CONFIG.lemonProductId)) return { result: 'invalid', kind: 'wrong_product' };
  const st = data.license_key?.status;
  if (st === 'disabled' || st === 'expired') return { result: 'invalid', kind: st };
  if ((data.valid === true || data.activated === true) && status === 200 && meta.store_id !== undefined) return { result: 'ok' };
  if (/activation limit/i.test(data.error || '')) {
    const n = data.license_key?.activation_limit;
    return {
      result: 'invalid',
      kind: 'limit',
      error: `This key is active on ${n || 'the maximum number of'} devices. Deactivate it on one${CONFIG.supportEmail ? `, or email ${CONFIG.supportEmail} and I'll reset it` : ''}.`,
    };
  }
  if (data.valid === false || data.activated === false || status !== 200) return { result: 'invalid', kind: 'rejected' };
  return { result: 'transient' };
}

// `activating`: this call incremented the uses count, so enforce the device cap.
export function classifyGumroad({ status, data }, activating = false) {
  if (!CONFIG.gumroadProductId) return { result: 'invalid', kind: 'config', error: 'License check is not configured yet. Please email support.' };
  if (!data || !(status === 200 || status === 400 || status === 404)) return { result: 'transient' };
  const p = data.purchase || {};
  const cap = CONFIG.activationLimit || 5;
  if (data.success === true && activating && Number(data.uses) > cap) {
    return {
      result: 'invalid',
      kind: 'limit',
      error: `This key has been activated more than ${cap} times${CONFIG.supportEmail ? `. Email ${CONFIG.supportEmail} and I'll reset it` : ''}.`,
    };
  }
  if (data.success === true && !(p.refunded || p.chargebacked || p.disputed)) return { result: 'ok' };
  if (data.success === true) return { result: 'invalid', kind: 'refunded' };
  if (data.success === false && status !== 200) return { result: 'invalid', kind: 'rejected' };
  return { result: 'transient' };
}

async function check(key, instanceId) {
  const p = CONFIG.licenseProvider;
  if (p === 'none') {
    return isLocal() ? { result: 'ok' } : { result: 'invalid', kind: 'config', error: "licenseProvider 'none' only works on localhost." };
  }
  if (p === 'gumroad') {
    const r = await postForm('https://api.gumroad.com/v2/licenses/verify', {
      product_id: CONFIG.gumroadProductId,
      license_key: key,
      increment_uses_count: instanceId ? 'false' : 'true',
    });
    return { ...classifyGumroad(r, !instanceId), instanceId: 'gumroad' };
  }
  if (instanceId) {
    const r = await postForm(LEMON + 'validate', { license_key: key, instance_id: instanceId });
    return { ...classifyLemon(r), instanceId };
  }
  const r = await postForm(LEMON + 'activate', { license_key: key, instance_name: 'AdvisorScout web' });
  return { ...classifyLemon(r), instanceId: r.data?.instance?.id };
}

// Returns { ok, error?, kind? }; kind is a short enum safe to send to analytics.
export async function activate(key) {
  key = key.trim();
  if (!key) return { ok: false, kind: 'empty', error: 'Paste your license key.' };
  let r;
  try {
    r = await check(key);
  } catch {
    r = { result: 'transient' };
  }
  if (r.result === 'transient') return { ok: false, kind: 'network', error: 'Could not reach the license server. Try again in a minute.' };
  if (r.result !== 'ok') return { ok: false, kind: r.kind, error: r.error || 'That key was not accepted.' };
  save({ key, instanceId: r.instanceId, checkedAt: Date.now() });
  return { ok: true };
}

export function isPro() {
  return !!load();
}

// Re-checks once a week. Only a definitive answer revokes; network errors,
// 429 and 5xx keep the unlock and leave checkedAt alone so the next load retries.
export async function refresh() {
  const lic = load();
  if (!lic || Date.now() - lic.checkedAt < WEEK) return !!lic;
  try {
    const r = await check(lic.key, lic.instanceId);
    if (r.result === 'invalid') {
      save(null);
      return false;
    }
    if (r.result === 'ok') save({ ...lic, checkedAt: Date.now() });
  } catch {
    /* keep */
  }
  return true;
}

// Frees this device's activation slot (Lemon Squeezy), then forgets the key.
export async function deactivate() {
  const lic = load();
  let freed = false;
  if (lic && CONFIG.licenseProvider === 'lemonsqueezy' && lic.instanceId) {
    try {
      const r = await postForm(LEMON + 'deactivate', { license_key: lic.key, instance_id: lic.instanceId });
      freed = r.status === 200 && r.data?.deactivated === true;
    } catch {
      /* offline: still forget locally */
    }
  }
  save(null);
  return { freed };
}
