// Shared CSV writer. Guards against spreadsheet formula injection and adds a
// UTF-8 BOM so Excel shows non-ASCII names (e.g. "Müller", "Çelik") correctly.

export function csvCell(v) {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csv(rows) {
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}
