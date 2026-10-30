import { CONFIG } from './config.js';
import { findAdvisors, emailHook, firstPlaceholder, toCsv, BASE, openalexRoute, viaProxy } from './openalex.js';
import { parseSearch, searchParams, whatsappUrl, attribution, regionalOffer, checkoutUrl } from './share.js';
import { makeFetchJson, makeStorageCache, ApiError, retryable } from './http.js';
import { FOLLOW_UP_DAYS, STATUSES, localToday, dueDate, isOverdue, validateBackup, mergeBackup, trackerCsv } from './tracker.js';
import * as license from './license.js';
import * as analytics from './analytics.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const store = {
  get(k, d) {
    try {
      return JSON.parse(localStorage.getItem(k)) ?? d;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
      return true;
    } catch {
      return false;
    }
  },
};

let results = [];
let pro = license.isPro();
let searchSeq = 0;
let upgradeSource = 'header';
let lastSearch = null; // the query of the results on screen, for share links and headlines

let storage = null;
try {
  storage = localStorage;
} catch {
  /* blocked: no persistent cache */
}
const fetchJson = makeFetchJson({ cache: storage ? makeStorageCache({ storage }) : null });

// A visitor's own free OpenAlex key goes straight to OpenAlex with that key.
function openalexCfg() {
  const own = store.get('as.oaKey', '');
  return own ? { ...CONFIG.openalex, base: BASE, apiKey: own } : CONFIG.openalex;
}

// Hybrid routing: free visitors use their own keyless OpenAlex allowance and fall back
// to the owner's Worker (CONFIG.openalex.proxy) on a 429; Pro goes through the Worker.
function routedFetch() {
  const proxy = CONFIG.openalex.proxy;
  const route = openalexRoute({ proxy, pro, ownKey: store.get('as.oaKey', '') });
  if (route === 'direct') return fetchJson;
  if (route === 'proxy') return (url) => fetchJson(viaProxy(url, proxy));
  return async (url) => {
    try {
      return await fetchJson(url);
    } catch (e) {
      if (e instanceof ApiError && e.kind === 'rate') return fetchJson(viaProxy(url, proxy));
      throw e;
    }
  };
}

function rateMessage() {
  const proxied = !!CONFIG.openalex.proxy;
  let html = esc(new ApiError('rate').message);
  if (pro) return html + (proxied ? ' Our own quota is used up too; it also resets at 00:00 UTC.' : '');
  if (proxied) html += ' Pro searches use our own quota. <button type="button" data-act="upgrade-rate" class="primary">Unlock Pro</button>';
  return html + ' Or add your own free OpenAlex key under "How the ranking works".';
}

// ---------- Search ----------
const bucket = (n) => (n === 0 ? '0' : n <= 5 ? '1-5' : n <= 20 ? '6-20' : '21+');

function lastQuery() {
  const f = $('#search-form');
  return { query: f.query.value, country: f.country.value, years: +f.years.value, minH: +f.minH.value };
}

async function onSearch(e) {
  e?.preventDefault();
  const f = $('#search-form');
  const status = $('#status');
  const btn = $('button[type=submit]', f);
  const seq = ++searchSeq;
  btn.disabled = true;
  btn.textContent = 'Searching…';
  results = [];
  lastSearch = null;
  $('#results').innerHTML = '';
  $('#share').hidden = true;
  try {
    const out = await findAdvisors(lastQuery(), {
      fetchJson: routedFetch(),
      cfg: openalexCfg(),
      onProgress: (m) => seq === searchSeq && (status.textContent = m),
    });
    if (seq !== searchSeq) return; // a newer search started
    results = out;
    lastSearch = out.length ? lastQuery() : null;
    const n = out.length;
    status.innerHTML = n ? matchLine() : emptyState(out);
    if (n) {
      try {
        history.replaceState(null, '', '?' + searchParams(lastSearch) + location.hash);
      } catch {
        /* file:// or sandboxed iframe */
      }
      $('#sample').hidden = true;
    }
    if (out.partial) status.innerHTML += ' <span class="warn">Some paper data could not be loaded, so a few profiles show limited data.</span>';
    renderResults();
    renderCapture();
    analytics.track('search', { bucket: bucket(out.length), paywalled: !pro && out.length > CONFIG.freeResults, error: null });
  } catch (err) {
    if (seq !== searchSeq) return;
    const kind = err instanceof ApiError ? err.kind : 'input';
    status.innerHTML =
      kind === 'rate' ? rateMessage() : esc(err.message) + (retryable(kind) ? ' <button type="button" data-act="retry">Retry</button>' : '');
    analytics.track('search', { bucket: '0', paywalled: false, error: kind });
  } finally {
    if (seq === searchSeq) {
      btn.disabled = false;
      btn.textContent = 'Find advisors';
    }
  }
}

function matchLine() {
  const n = results.length;
  const q = esc(lastSearch?.query);
  return !pro && n > CONFIG.freeResults
    ? `Showing your top ${CONFIG.freeResults} of ${n} matches for "${q}".`
    : `${n} match${n === 1 ? '' : 'es'} for "${q}".`;
}

function emptyState(out) {
  if (out.reason === 'filtered') {
    const f = $('#search-form');
    const d = out.dropped || {};
    return `Found researchers on this topic, but none passed your filters${d.minH ? ` (${d.minH} below the min h-index)` : ''}.
      ${+f.minH.value > 5 ? '<button type="button" data-act="lower-h">Lower min h-index</button>' : ''}
      ${f.country.value ? '<button type="button" data-act="any-country">Remove country</button>' : ''}`;
  }
  return 'No recent papers match this topic. Try broader or more common wording (e.g. "protein design" instead of a long phrase).';
}

$('#status').addEventListener('click', (e) => {
  const act = e.target.dataset?.act;
  const f = $('#search-form');
  if (act === 'lower-h') {
    const opts = [...f.minH.options].map((o) => +o.value);
    f.minH.value = String([...opts].reverse().find((v) => v < +f.minH.value) ?? opts[0]);
  }
  if (act === 'any-country') f.country.value = '';
  if (act === 'upgrade-rate') return openPro('rate');
  if (act === 'retry' || act === 'lower-h' || act === 'any-country') onSearch();
});

function card(r, i, { sample = false } = {}) {
  const saved = shortlist().some((s) => s.id === r.id);
  const papers = r.papers
    .slice(0, 3)
    .map((p) => `<li><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a> <span class="muted">(${esc(p.year || 'n.d.')})</span></li>`)
    .join('');
  return `<article class="card" data-i="${i}">
    <div class="card-head">
      <div>
        <h3>${esc(r.name)}</h3>
        <div class="muted">${esc(r.institution)} · ${esc(r.country)} <span class="src">(${esc(r.instSource)})</span></div>
      </div>
      <div class="score" title="Fit score (0–100)">${r.score}</div>
    </div>
    <div class="badges">${r.badges.map((b) => `<span class="badge">${esc(b)}</span>`).join('')}</div>
    <dl class="stats">
      <div title="Papers matching your topic in the chosen window"><dt>On-topic papers</dt><dd>${r.topicCount}</dd></div>
      <div title="How often they are the last author, the usual spot for a lab head"><dt>Senior-author share</dt><dd>${r.lowEvidence ? '—' : Math.round(r.lastAuthorShare * 100) + '%'}</dd></div>
      <div title="h papers with at least h citations each: a rough measure of how established they are"><dt>h-index</dt><dd>${r.hIndex}</dd></div>
      <div title="Distinct first authors on their senior-author papers: a rough guide to lab size"><dt>First authors (lab size)</dt><dd>${r.lowEvidence ? '—' : r.students.length}</dd></div>
    </dl>
    <details><summary>Recent papers on this topic</summary><ul>${papers || '<li>None in window</li>'}</ul>
      ${r.students.length ? `<p class="muted">First authors on their papers: ${esc(r.students.slice(0, 6).join(', '))}</p>` : ''}
    </details>
    ${sample ? '' : `<div class="actions">
      <button data-act="save">${saved ? '★ Saved' : '☆ Shortlist'}</button>
      <button data-act="email">${pro || i === 0 ? '' : '🔒 '}Email draft${!pro && i === 0 ? ' (free sample)' : ''}</button>
      <a href="${esc(r.openalex)}" target="_blank" rel="noopener">Profile ↗</a>
      <a href="https://scholar.google.com/scholar?q=${encodeURIComponent(`"${r.name}" ${r.institution}`)}" target="_blank" rel="noopener">Scholar ↗</a>
    </div>`}
  </article>`;
}

function renderResults() {
  const visible = pro ? results : results.slice(0, CONFIG.freeResults);
  const hidden = results.length - visible.length;
  let html = visible.map(card).join('');
  if (hidden > 0) {
    const more = results.slice(CONFIG.freeResults);
    const count = (b) => more.filter((r) => r.badges.includes(b)).length;
    const extras = [['Rising PI', 'Rising PIs'], ['Likely PI', 'Likely PIs']]
      .map(([b, label]) => [count(b), label])
      .filter(([n]) => n > 0)
      .map(([n, label]) => `${n} ${label}`);
    html += `<div class="card locked">
      <h3>+${hidden} more matches${extras.length ? `, including ${extras.join(' and ')}` : ''}</h3>
      <p>Unlock every result, a cold-email starter for each, CSV export and an unlimited tracker.</p>
      <button class="primary" data-act="upgrade">Unlock for ${esc(CONFIG.price)}</button>
      ${CONFIG.refundDays ? `<p class="muted small">Money-back guarantee within ${CONFIG.refundDays} days.</p>` : ''}
    </div>`;
  }
  if (results.length) {
    html += `<div class="row"><button data-act="csv">${pro ? '' : '🔒 '}Export CSV</button></div>`;
  }
  $('#results').innerHTML = html;
  renderShare();
  if (hidden > 0) analytics.track('paywall_view', { source: 'results' });
}

function download(name, text, type = 'text/csv;charset=utf-8') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$('#results').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;
  const r = results[+btn.closest('[data-i]')?.dataset.i];
  if (act === 'upgrade') return openPro('more');
  if (act === 'csv') {
    if (!pro) return openPro('csv');
    analytics.track('pro_feature_used', { feature: 'csv' });
    return download('advisors.csv', toCsv(results));
  }
  if (act === 'save') return toggleSave(r, btn);
  if (act === 'email') {
    const sample = !pro && results.indexOf(r) === 0;
    if (!pro && !sample) return openPro('email');
    analytics.track('pro_feature_used', { feature: sample ? 'email_sample' : 'email' });
    $('#email-text').value = emailHook(r);
    $('#email-sample').hidden = !sample;
    $('#email-dialog').showModal();
  }
});

// ---------- Tracker ----------
const shortlist = () => store.get('as.shortlist', []);

function saveList(list) {
  store.set('as.shortlist', list);
  if (!store.get('as.persisted', false)) {
    navigator.storage?.persist?.().then((ok) => ok && store.set('as.persisted', true)).catch(() => {});
  }
}

function toggleSave(r, btn) {
  let list = shortlist();
  if (list.some((s) => s.id === r.id)) {
    list = list.filter((s) => s.id !== r.id);
    btn.textContent = '☆ Shortlist';
  } else {
    if (!pro && list.length >= CONFIG.freeShortlist) {
      analytics.track('paywall_view', { source: 'tracker' });
      return openPro('tracker-cap');
    }
    list.push({
      id: r.id,
      name: r.name,
      institution: r.institution,
      topic: r.query,
      paper: r.papers[0] || null,
      status: 'To contact',
      emailed: '',
      notes: '',
    });
    btn.textContent = '★ Saved';
  }
  saveList(list);
  renderTracker();
}

function dueCell(s, today) {
  const due = dueDate(s.emailed);
  const overdue = isOverdue(s, today);
  return { text: due ? due + (overdue ? ' · follow up!' : '') : '—', overdue };
}

function backupNudge(list) {
  const last = store.get('as.lastBackup', 0);
  const days = Math.floor((Date.now() - last) / 86400000);
  if (list.length < 3 || days < 14) return '';
  return `<p class="warn">${last ? `Last backup: ${days} days ago.` : 'Not backed up yet.'} Your tracker lives only in this browser; download a backup.</p>`;
}

function renderTracker() {
  const list = shortlist();
  const today = localToday();
  $('#tracker-count').textContent = list.length;
  const tools = `<div class="row">
      <button data-act="backup">Backup (.json)</button>
      <label class="file-btn btn">Restore<input type="file" accept="application/json,.json" data-act="restore" hidden></label>
      ${list.length ? `<button data-act="tracker-csv">${pro ? '' : '🔒 '}Export tracker CSV</button>` : ''}
    </div>`;
  if (!list.length) {
    $('#tracker').innerHTML = '<p class="muted">Shortlist professors from your search results to track outreach here.</p>' + tools;
    return;
  }
  const rows = list
    .map((s) => {
      const due = dueCell(s, today);
      return `<tr data-id="${esc(s.id)}">
        <td data-label="Professor"><strong>${esc(s.name)}</strong><div class="muted">${esc(s.institution)}</div></td>
        <td data-label="Status"><select data-f="status" aria-label="Status">${STATUSES.map((x) => `<option ${x === s.status ? 'selected' : ''}>${x}</option>`).join('')}</select></td>
        <td data-label="Emailed on"><input type="date" data-f="emailed" value="${esc(s.emailed)}" aria-label="Emailed on"></td>
        <td data-label="Follow-up due" data-due class="${due.overdue ? 'overdue' : ''}">${esc(due.text)}</td>
        <td data-label="Notes" class="notes"><input data-f="notes" value="${esc(s.notes)}" placeholder="Notes" aria-label="Notes"></td>
        <td class="rm"><button data-act="remove" aria-label="Remove">✕</button></td>
      </tr>`;
    })
    .join('');
  $('#tracker').innerHTML = backupNudge(list) + `<div class="table-wrap"><table>
    <thead><tr><th>Professor</th><th>Status</th><th>Emailed on</th><th>Follow-up due</th><th>Notes</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table></div>` + tools;
}

// Patch only the edited row so focus and the open date picker survive.
$('#tracker').addEventListener('change', (e) => {
  const f = e.target.dataset.f;
  const row = e.target.closest('[data-id]');
  if (f && row) {
    const list = shortlist();
    const s = list.find((x) => x.id === row.dataset.id);
    if (!s) return;
    s[f] = e.target.value;
    if (f === 'emailed' && e.target.value && s.status === 'To contact') {
      s.status = 'Emailed';
      $('[data-f=status]', row).value = 'Emailed';
    }
    saveList(list);
    const due = dueCell(s, localToday());
    const cell = $('[data-due]', row);
    cell.textContent = due.text;
    cell.classList.toggle('overdue', due.overdue);
    return;
  }
  if (e.target.dataset.act === 'restore') restore(e.target);
});

async function restore(input) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const incoming = validateBackup(JSON.parse(await file.text()));
    const current = shortlist();
    const clash = incoming.filter((r) => current.some((c) => c.id === r.id)).length;
    if (clash && !confirm(`${clash} professor(s) are already in your tracker. Replace them with the backup's version?`)) return;
    saveList(mergeBackup(current, incoming));
    renderTracker();
    if (results.length) renderResults();
  } catch (err) {
    alert(`Could not restore: ${err.message}`);
  }
}

$('#tracker').addEventListener('click', (e) => {
  const act = e.target.dataset.act;
  if (act === 'remove') {
    const id = e.target.closest('[data-id]').dataset.id;
    saveList(shortlist().filter((s) => s.id !== id));
    renderTracker();
    if (results.length) renderResults();
  }
  if (act === 'backup') {
    download(`advisorscout-backup-${localToday()}.json`, JSON.stringify({ app: 'advisorscout', version: 1, shortlist: shortlist() }, null, 2), 'application/json');
    store.set('as.lastBackup', Date.now());
    renderTracker();
  }
  if (act === 'tracker-csv') {
    if (!pro) return openPro('tracker-csv');
    analytics.track('pro_feature_used', { feature: 'tracker_csv' });
    download('outreach-tracker.csv', trackerCsv(shortlist()));
  }
});

// ---------- Pro ----------
// Why the dialog opened, so the headline matches what the user just tried to do.
function proHeadline(reason) {
  const q = lastSearch?.query;
  const hidden = Math.max(0, results.length - CONFIG.freeResults);
  switch (reason) {
    case 'more':
      return hidden && q ? `${hidden} more matches hidden for "${q}"` : 'See every match';
    case 'email':
      return 'Get a cold-email starter for every match';
    case 'rate':
      return 'Keep searching today: Pro searches use our own OpenAlex quota';
    case 'csv':
      return 'Export every match to a spreadsheet';
    case 'tracker-cap':
      return `You've tracked ${CONFIG.freeShortlist} professors. Pro tracks unlimited and flags who is due a follow-up`;
    case 'tracker-csv':
      return 'Export your outreach tracker to CSV';
    default:
      return '';
  }
}

function openPro(source = 'header') {
  upgradeSource = source;
  analytics.track('upgrade_click', { source });
  const headline = proHeadline(source);
  $('#pro-title').textContent = headline || 'Unlock AdvisorScout Pro';
  $('#pro-reason').textContent = headline ? 'AdvisorScout Pro includes:' : '';
  $('#pro-reason').hidden = !headline;
  $('#pro-error').textContent = '';
  $('#pro-help').hidden = true;
  if ($('#email-dialog').open) $('#email-dialog').close();
  $('#pro-dialog').showModal();
}

function setPro(v) {
  pro = v;
  document.body.classList.toggle('is-pro', v);
  $('#pro-state').textContent = v ? 'Pro ✓' : 'Unlock Pro';
  $('#pro-manage').hidden = !v;
  if (results.length) {
    renderResults();
    if (lastSearch) $('#status').innerHTML = matchLine();
  }
  renderTracker();
}

$('#pro-state').addEventListener('click', () => (pro ? null : openPro('header')));
$('#pricing-pro').addEventListener('click', () => openPro('pricing'));
$('#buy-link').addEventListener('click', (e) => {
  const href = buyHref();
  if (!href) {
    e.preventDefault();
    return;
  }
  analytics.track('checkout_click', { source: upgradeSource });
  e.currentTarget.href = href;
});
$('#license-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('button[type=submit]', e.target);
  btn.disabled = true;
  const r = await license.activate(e.target.key.value);
  btn.disabled = false;
  analytics.track('license_activate', { ok: r.ok, error_kind: r.kind });
  if (!r.ok) {
    $('#pro-error').textContent = r.error;
    if (CONFIG.supportEmail) {
      const help = $('#pro-help');
      help.innerHTML = `Still stuck? Email <a href="mailto:${esc(CONFIG.supportEmail)}">${esc(CONFIG.supportEmail)}</a> with your order number. We'll fix it or refund you.`;
      help.hidden = false;
    }
    return;
  }
  $('#pro-dialog').close();
  setPro(true);
});
$('#deactivate').addEventListener('click', async () => {
  if (!confirm('Deactivate Pro on this device? You can activate the same key on another device afterwards.')) return;
  const { freed } = await license.deactivate();
  setPro(false);
  $('#status').textContent = freed ? 'Pro deactivated on this device; the activation slot is free.' : 'Pro removed from this device.';
});
$('#copy-email').addEventListener('click', async () => {
  const ta = $('#email-text');
  const ph = firstPlaceholder(ta.value);
  if (ph) {
    ta.focus();
    ta.setSelectionRange(ph.index, ph.index + ph.length);
    if (!confirm(`${ph.text} is still unfilled. Copy anyway?`)) return;
  }
  await copyText(ta.value);
  $('#copy-email').textContent = 'Copied ✓';
  setTimeout(() => ($('#copy-email').textContent = 'Copy'), 1500);
});
$('#email-upgrade').addEventListener('click', () => openPro('email'));
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));

// ---------- Own OpenAlex key ----------
const keyInput = $('#oa-key');
keyInput.value = store.get('as.oaKey', '');
$('#oa-key-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = keyInput.value.trim();
  store.set('as.oaKey', v);
  $('#oa-key-state').textContent = v ? 'Saved. Searches now use your own OpenAlex allowance.' : 'Removed.';
});

// ---------- Sharing ----------
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    prompt('Copy this:', text); // clipboard blocked (http, old browser, iframe)
    return false;
  }
}

function shareLink() {
  return lastSearch ? `${location.origin}${location.pathname}?${searchParams(lastSearch)}` : location.href;
}

function countryName(code) {
  return code ? $(`#search-form [name=country] option[value="${code}"]`)?.textContent || code : '';
}

function renderShare() {
  const box = $('#share');
  box.hidden = !results.length || !lastSearch;
  if (box.hidden) return;
  $('[data-share=whatsapp]', box).href = whatsappUrl(lastSearch.query, countryName(lastSearch.country), shareLink());
  $('[data-share=native]', box).hidden = !navigator.share;
}

$('#share').addEventListener('click', async (e) => {
  const how = e.target.closest('[data-share]')?.dataset.share;
  if (!how) return;
  analytics.track('share', { method: how });
  if (how === 'copy') {
    const ok = await copyText(shareLink());
    if (ok) {
      e.target.textContent = 'Link copied ✓';
      setTimeout(() => (e.target.textContent = 'Copy link to these results'), 1500);
    }
  }
  if (how === 'native') {
    navigator.share({ title: 'AdvisorScout', text: `Professors actively publishing on ${lastSearch.query}`, url: shareLink() }).catch(() => {});
  }
});

// Prefill from ?q=&country=&years=&minH= and run once, so posts can deep-link a search.
function searchFromUrl() {
  const f = $('#search-form');
  const opts = (sel) => [...f[sel].options].map((o) => o.value);
  const p = parseSearch(location.search, {
    countries: opts('country').filter(Boolean),
    years: opts('years').map(Number),
    minH: opts('minH').map(Number),
  });
  if (!p.q) return false;
  f.query.value = p.q;
  f.country.value = p.country;
  if (p.years) f.years.value = String(p.years);
  if (p.minH) f.minH.value = String(p.minH);
  onSearch();
  return true;
}

$('#chips').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  $('#search-form').query.value = chip.textContent;
  onSearch();
});

// ---------- Sample results (src/sample.json, made by scripts/make-sample.mjs) ----------
// Rendered outside #results so its buttons never touch results[].
async function renderSample() {
  try {
    const res = await fetch('src/sample.json');
    if (!res.ok) return;
    const data = await res.json();
    if (results.length || !Array.isArray(data.results) || !data.results.length) return;
    const box = $('#sample');
    box.innerHTML =
      `<p class="muted">Sample results for "${esc(data.query)}" (${esc(data.date)}). <button type="button" data-q="${esc(data.query)}">Run this search</button></p>` +
      data.results
        .slice(0, 3)
        .map((r, i) => card({ badges: [], students: [], papers: [], ...r }, i, { sample: true }))
        .join('');
    box.hidden = false;
    box.addEventListener('click', (e) => {
      const q = e.target.dataset?.q;
      if (!q) return;
      $('#search-form').query.value = q;
      onSearch();
    });
  } catch {
    /* sample is optional */
  }
}

// ---------- Trust, pricing and checkout ----------
const PROVIDER_NAME = { lemonsqueezy: 'Lemon Squeezy', gumroad: 'Gumroad' };
let saleCode = null;
let offer = null;

function initAttribution() {
  try {
    saleCode = attribution(location.search, store.get('as.code', null));
    if (saleCode) store.set('as.code', saleCode);
  } catch {
    saleCode = null;
  }
  try {
    offer = saleCode ? null : regionalOffer(CONFIG.regionalOffers, Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    offer = null;
  }
}

function buyHref() {
  return checkoutUrl(CONFIG.checkoutUrl, {
    provider: CONFIG.licenseProvider,
    channel: analytics.channel(),
    code: saleCode?.code || offer?.code || '',
  });
}

function renderTrust() {
  const provider = PROVIDER_NAME[CONFIG.licenseProvider];
  const parts = [
    CONFIG.refundDays ? `${CONFIG.refundDays}-day refund` : '',
    provider ? `Secure checkout by ${provider}, we never see your card` : '',
    'Key arrives by email instantly',
    CONFIG.activationLimit ? `Works on ${CONFIG.activationLimit} devices, never expires` : 'Never expires',
  ].filter(Boolean);
  document.querySelectorAll('[data-trust]').forEach((el) => (el.textContent = parts.join(' · ') + '.'));
  document.querySelectorAll('[data-refund]').forEach((el) => {
    el.textContent = CONFIG.refundDays ? `Pro comes with a ${CONFIG.refundDays}-day no-questions refund.` : '';
  });
  document.querySelectorAll('[data-seller]').forEach((el) => (el.textContent = CONFIG.sellerName || CONFIG.productName));
  document.querySelectorAll('[data-contact]').forEach((el) => {
    el.innerHTML = CONFIG.supportEmail ? ` · Contact: <a href="mailto:${esc(CONFIG.supportEmail)}">${esc(CONFIG.supportEmail)}</a>` : '';
  });
  const founder = $('#founder');
  if (CONFIG.founderLine) {
    founder.innerHTML = CONFIG.founderUrl
      ? `${esc(CONFIG.founderLine)} <a href="${esc(CONFIG.founderUrl)}" target="_blank" rel="noopener">Why I built it ↗</a>`
      : esc(CONFIG.founderLine);
    founder.hidden = false;
  }
  const quotes = (CONFIG.testimonials || []).filter((t) => t?.quote);
  if (quotes.length) {
    $('#testimonials').innerHTML = quotes
      .map((t) => `<blockquote>“${esc(t.quote)}”${t.who ? `<cite>${esc(t.who)}</cite>` : ''}</blockquote>`)
      .join('');
    $('#testimonials').hidden = false;
  }
  const lp = CONFIG.localPay || {};
  const wa = String(lp.whatsapp || '').replace(/\D/g, '');
  if (wa) {
    const msg = encodeURIComponent(`Hi, I'd like AdvisorScout Pro and will pay PKR ${lp.pricePKR} by JazzCash/Easypaisa.`);
    $('#local-pay').innerHTML = `Card declined or no international card? Pay PKR ${Number(lp.pricePKR).toLocaleString('en-US')} by JazzCash/Easypaisa: <a href="https://wa.me/${wa}?text=${msg}" target="_blank" rel="noopener">message me on WhatsApp</a> and get your key within a few hours. Tip: card payments are charged in USD, so turn on international/e-commerce payments in your bank app before retrying.`;
    $('#local-pay').hidden = false;
  }
}

function renderPrice() {
  const price = offer?.priceLabel || CONFIG.price;
  document.querySelectorAll('[data-price]').forEach((el) => (el.textContent = price));
  document.querySelectorAll('[data-price-note]').forEach((el) => (el.textContent = CONFIG.priceNote));
  const code = saleCode?.code || offer?.code;
  const banner = $('#code-banner');
  if (code) {
    const label = (CONFIG.codes || {})[code];
    banner.textContent = `Code ${code} applied at checkout${label ? `: ${label}` : ''}${offer && !saleCode ? ' (regional price)' : ''}.`;
    banner.hidden = false;
  }
  const buy = $('#buy-link');
  const href = buyHref();
  if (href) buy.href = href;
  else {
    buy.removeAttribute('href');
    buy.setAttribute('aria-disabled', 'true');
    buy.classList.add('disabled');
    buy.textContent = 'Checkout not set up yet';
    console.warn('AdvisorScout: CONFIG.checkoutUrl is still a placeholder; the Buy button is disabled.');
  }
}

// Lemon Squeezy's own affiliate script credits ?aff= links and decorates checkout links.
function initAffiliates() {
  const slug = String(CONFIG.lsStoreSlug || '');
  if (CONFIG.licenseProvider !== 'lemonsqueezy' || !/^[a-z0-9-]+$/i.test(slug)) return;
  window.lemonSqueezyAffiliateConfig = { store: slug };
  const s = document.createElement('script');
  s.src = 'https://lmsqueezy.com/affiliate.js';
  s.defer = true;
  document.head.appendChild(s);
}

// ---------- Email capture (Kit form; hidden until CONFIG.emailCapture.action is set) ----------
function renderCapture() {
  const action = CONFIG.emailCapture?.action;
  $('#capture').hidden = !action || !/^https:\/\//.test(action) || store.get('as.subscribed', false) || !results.length;
}

$('#capture-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const data = new FormData(form);
  if (CONFIG.emailCapture.topicField && lastSearch) data.set('fields[topic]', lastSearch.query);
  const btn = $('button', form);
  btn.disabled = true;
  try {
    await fetch(CONFIG.emailCapture.action, { method: 'POST', mode: 'no-cors', body: data });
    $('#capture-state').textContent = 'Check your inbox to confirm, then the checklist is on its way.';
    store.set('as.subscribed', true);
    form.hidden = true;
    analytics.track('signup', {});
  } catch {
    $('#capture-state').textContent = 'Could not reach the mailing service. Try again, or read the checklist on the guide page.';
    btn.disabled = false;
  }
});

// ---------- Boot ----------
analytics.init();
analytics.channel();
initAttribution();
initAffiliates();
renderPrice();
renderTrust();
document.querySelectorAll('[data-follow-up]').forEach((el) => (el.textContent = FOLLOW_UP_DAYS));
$('#search-form').addEventListener('submit', onSearch);
setPro(pro);
license.refresh().then((ok) => ok !== pro && setPro(ok));
if (!searchFromUrl()) renderSample();
