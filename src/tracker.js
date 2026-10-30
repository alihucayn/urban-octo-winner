// Outreach-tracker helpers: date math, backup validation and CSV. No DOM.
import { csv } from './csv.js';

export const FOLLOW_UP_DAYS = 10;
export const STATUSES = ['To contact', 'Emailed', 'Followed up', 'Replied', 'Interview', 'Not taking students'];

// The visitor's local calendar date as YYYY-MM-DD (toISOString() would give the UTC date).
export function localToday(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// Pure calendar math in UTC, so DST changes can't shift the result by a day.
export function dueDate(emailed, days = FOLLOW_UP_DAYS) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(emailed || '')) return '';
  const d = new Date(emailed + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isOverdue(row, today = localToday()) {
  const due = dueDate(row.emailed);
  return !!due && due <= today && row.status === 'Emailed';
}

const isStr = (v) => typeof v === 'string';

// Returns the cleaned rows, or throws with a message the UI can show.
export function validateBackup(data) {
  const rows = Array.isArray(data) ? data : data?.shortlist;
  if (!Array.isArray(rows)) throw new Error('Not an AdvisorScout backup file.');
  return rows.map((r, i) => {
    if (!r || !isStr(r.id) || !r.id || !isStr(r.name)) throw new Error(`Row ${i + 1} is missing an id or name.`);
    return {
      id: r.id,
      name: r.name,
      institution: isStr(r.institution) ? r.institution : '',
      topic: isStr(r.topic) ? r.topic : '',
      paper: r.paper && isStr(r.paper.title) ? { title: r.paper.title, year: r.paper.year, url: isStr(r.paper.url) ? r.paper.url : '' } : null,
      status: STATUSES.includes(r.status) ? r.status : 'To contact',
      emailed: isStr(r.emailed) && /^\d{4}-\d{2}-\d{2}$/.test(r.emailed) ? r.emailed : '',
      notes: isStr(r.notes) ? r.notes : '',
    };
  });
}

// Merge by id; rows from the backup replace existing rows with the same id.
export function mergeBackup(current, incoming) {
  const byId = new Map(current.map((r) => [r.id, r]));
  for (const r of incoming) byId.set(r.id, r);
  return [...byId.values()];
}

export function trackerCsv(list) {
  const head = ['name', 'institution', 'topic', 'status', 'emailed', 'follow_up_due', 'notes', 'hook_paper'];
  return csv([head, ...list.map((s) => [s.name, s.institution, s.topic, s.status, s.emailed, dueDate(s.emailed), s.notes, s.paper?.title || ''])]);
}
