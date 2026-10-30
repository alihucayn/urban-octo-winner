import { CONFIG } from './config.js';
import { findAdvisors, emailHook, toCsv } from './openalex.js';
import * as license from './license.js';

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
    } catch {
      /* ignore */
    }
  },
};

let results = [];
let pro = license.isPro();

async function fetchJson(url) {
  try {
    const hit = sessionStorage.getItem(url);
    if (hit) return JSON.parse(hit);
  } catch {
    /* ignore */
  }
  const res = await fetch(url);
  if (res.status === 429) throw new Error('OpenAlex daily limit reached for your connection. Try again later.');
  if (!res.ok) throw new Error(`OpenAlex error ${res.status}. Try a simpler topic.`);
  const data = await res.json();
  try {
    sessionStorage.setItem(url, JSON.stringify(data));
  } catch {
    /* ignore quota */
  }
  return data;
}

// ---------- Search ----------
async function onSearch(e) {
  e.preventDefault();
  const f = e.target;
  const status = $('#status');
  const btn = $('button[type=submit]', f);
  btn.disabled = true;
  $('#results').innerHTML = '';
  try {
    results = await findAdvisors(
      { query: f.query.value, country: f.country.value, years: +f.years.value, minH: +f.minH.value },
      { fetchJson, cfg: CONFIG.openalex, onProgress: (m) => (status.textContent = m) },
    );
    status.textContent = results.length
      ? `${results.length} potential advisors found.`
      : 'No matches. Try a broader topic or remove the country filter.';
    renderResults();
  } catch (err) {
    status.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
}

function card(r, i) {
  const saved = shortlist().some((s) => s.id === r.id);
  const papers = r.papers
    .slice(0, 3)
    .map((p) => `<li><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a> <span class="muted">(${esc(p.year)})</span></li>`)
    .join('');
  return `<article class="card" data-i="${i}">
    <div class="card-head">
      <div>
        <h3>${esc(r.name)}</h3>
        <div class="muted">${esc(r.institution)} · ${esc(r.country)}</div>
      </div>
      <div class="score" title="Fit score (0–100)">${r.score}</div>
    </div>
    <div class="badges">${r.badges.map((b) => `<span class="badge">${esc(b)}</span>`).join('')}</div>
    <dl class="stats">
      <div><dt>On-topic papers</dt><dd>${r.topicCount}</dd></div>
      <div><dt>Senior-author share</dt><dd>${Math.round(r.lastAuthorShare * 100)}%</dd></div>
      <div><dt>h-index</dt><dd>${r.hIndex}</dd></div>
      <div><dt>Lead students seen</dt><dd>${r.students.length}</dd></div>
    </dl>
    <details><summary>Recent papers on this topic</summary><ul>${papers || '<li>None in window</li>'}</ul>
      ${r.students.length ? `<p class="muted">First authors on their papers: ${esc(r.students.slice(0, 6).join(', '))}</p>` : ''}
    </details>
    <div class="actions">
      <button data-act="save">${saved ? '★ Saved' : '☆ Shortlist'}</button>
      <button data-act="email">${pro ? '' : '🔒 '}Email draft</button>
      <a href="${esc(r.openalex)}" target="_blank" rel="noopener">Profile ↗</a>
      <a href="https://scholar.google.com/scholar?q=${encodeURIComponent(`"${r.name}" ${r.institution}`)}" target="_blank" rel="noopener">Scholar ↗</a>
    </div>
  </article>`;
}

function renderResults() {
  const visible = pro ? results : results.slice(0, CONFIG.freeResults);
  const hidden = results.length - visible.length;
  let html = visible.map(card).join('');
  if (hidden > 0) {
    html += `<div class="card locked">
      <h3>+${hidden} more matches</h3>
      <p>Unlock every result, email drafts, CSV export and an unlimited tracker.</p>
      <button class="primary" data-act="upgrade">Unlock for ${esc(CONFIG.price)}</button>
    </div>`;
  }
  if (results.length) {
    html += `<div class="row"><button data-act="csv">${pro ? '' : '🔒 '}Export CSV</button></div>`;
  }
  $('#results').innerHTML = html;
}

function download(name, text, type = 'text/csv') {
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
  if (act === 'upgrade') return openPro();
  if (act === 'csv') return pro ? download('advisors.csv', toCsv(results)) : openPro();
  if (act === 'save') return toggleSave(r, btn);
  if (act === 'email') {
    if (!pro) return openPro();
    $('#email-text').value = emailHook(r);
    $('#email-dialog').showModal();
  }
});

// ---------- Tracker ----------
const shortlist = () => store.get('as.shortlist', []);
const FOLLOW_UP_DAYS = 10;

function toggleSave(r, btn) {
  let list = shortlist();
  if (list.some((s) => s.id === r.id)) {
    list = list.filter((s) => s.id !== r.id);
    btn.textContent = '☆ Shortlist';
  } else {
    if (!pro && list.length >= CONFIG.freeShortlist) return openPro();
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
  store.set('as.shortlist', list);
  renderTracker();
}

function dueDate(emailed) {
  if (!emailed) return '';
  const d = new Date(emailed);
  d.setDate(d.getDate() + FOLLOW_UP_DAYS);
  return d.toISOString().slice(0, 10);
}

const STATUSES = ['To contact', 'Emailed', 'Followed up', 'Replied', 'Interview', 'Not taking students'];

function renderTracker() {
  const list = shortlist();
  const today = new Date().toISOString().slice(0, 10);
  $('#tracker-count').textContent = list.length;
  if (!list.length) {
    $('#tracker').innerHTML = '<p class="muted">Shortlist professors from your search results to track outreach here.</p>';
    return;
  }
  const rows = list
    .map((s, i) => {
      const due = dueDate(s.emailed);
      const overdue = due && due <= today && (s.status === 'Emailed');
      return `<tr data-i="${i}">
        <td><strong>${esc(s.name)}</strong><div class="muted">${esc(s.institution)}</div></td>
        <td><select data-f="status">${STATUSES.map((x) => `<option ${x === s.status ? 'selected' : ''}>${x}</option>`).join('')}</select></td>
        <td><input type="date" data-f="emailed" value="${esc(s.emailed)}"></td>
        <td class="${overdue ? 'overdue' : ''}">${due ? esc(due) + (overdue ? ' · follow up!' : '') : '—'}</td>
        <td><input data-f="notes" value="${esc(s.notes)}" placeholder="Notes"></td>
        <td><button data-act="remove" aria-label="Remove">✕</button></td>
      </tr>`;
    })
    .join('');
  $('#tracker').innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Professor</th><th>Status</th><th>Emailed on</th><th>Follow-up due</th><th>Notes</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table></div>
    <div class="row"><button data-act="tracker-csv">${pro ? '' : '🔒 '}Export tracker CSV</button></div>`;
}

$('#tracker').addEventListener('change', (e) => {
  const f = e.target.dataset.f;
  const i = +e.target.closest('[data-i]')?.dataset.i;
  if (!f) return;
  const list = shortlist();
  list[i][f] = e.target.value;
  if (f === 'emailed' && e.target.value && list[i].status === 'To contact') list[i].status = 'Emailed';
  store.set('as.shortlist', list);
  renderTracker();
});

$('#tracker').addEventListener('click', (e) => {
  const act = e.target.dataset.act;
  if (act === 'remove') {
    const list = shortlist();
    list.splice(+e.target.closest('[data-i]').dataset.i, 1);
    store.set('as.shortlist', list);
    renderTracker();
    if (results.length) renderResults();
  }
  if (act === 'tracker-csv') {
    if (!pro) return openPro();
    const rows = shortlist().map((s) => [s.name, s.institution, s.topic, s.status, s.emailed, dueDate(s.emailed), s.notes, s.paper?.title || '']);
    const csv = [['name', 'institution', 'topic', 'status', 'emailed', 'follow_up_due', 'notes', 'hook_paper'], ...rows]
      .map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    download('outreach-tracker.csv', csv);
  }
});

// ---------- Pro ----------
function openPro() {
  $('#pro-error').textContent = '';
  $('#pro-dialog').showModal();
}

function setPro(v) {
  pro = v;
  document.body.classList.toggle('is-pro', v);
  $('#pro-state').textContent = v ? 'Pro ✓' : `Unlock Pro · ${CONFIG.price}`;
  if (results.length) renderResults();
  renderTracker();
}

$('#pro-state').addEventListener('click', () => (pro ? null : openPro()));
$('#license-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('button[type=submit]', e.target);
  btn.disabled = true;
  const r = await license.activate(e.target.key.value);
  btn.disabled = false;
  if (!r.ok) {
    $('#pro-error').textContent = r.error;
    return;
  }
  $('#pro-dialog').close();
  setPro(true);
});
$('#copy-email').addEventListener('click', async () => {
  await navigator.clipboard?.writeText($('#email-text').value);
  $('#copy-email').textContent = 'Copied ✓';
  setTimeout(() => ($('#copy-email').textContent = 'Copy'), 1500);
});
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));

// ---------- Boot ----------
document.querySelectorAll('[data-price]').forEach((el) => (el.textContent = CONFIG.price));
document.querySelectorAll('[data-price-note]').forEach((el) => (el.textContent = CONFIG.priceNote));
$('#buy-link').href = CONFIG.checkoutUrl;
$('#search-form').addEventListener('submit', onSearch);
setPro(pro);
license.refresh().then((ok) => ok !== pro && setPro(ok));
