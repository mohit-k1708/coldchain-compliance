// CSV writer/reader driven by the schema (header = schema column order, LF endings).
import { parseSchema } from './schema.js';

function fmt(v, col) {
  if (v === null || v === undefined) return '';
  if (col.type === 'NUMERIC') {
    const n = Math.abs(Number(v)) < 5e-9 ? 0 : Number(v);
    return n.toFixed(col.scale);
  }
  if (col.type === 'BOOLEAN') return v ? 'true' : 'false';
  return String(v);
}
const esc = (s) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function tableToCsv(table, rows) {
  const { columns, pk } = parseSchema().tables[table];
  const key = (r) => pk.map((c) => String(r[c])).join('\u0000');
  const sorted = [...rows].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  const lines = [columns.map((c) => c.name).join(',')];
  for (const r of sorted) lines.push(columns.map((c) => esc(fmt(r[c.name], c))).join(','));
  return lines.join('\n') + '\n';
}

export function parseCsv(text) {
  const rows = [];
  let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(f); f = ''; }
    else if (ch === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else if (ch !== '\r') f += ch;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows;
}

export function csvToRows(table, text) {
  const { columns } = parseSchema().tables[table];
  const [header, ...body] = parseCsv(text);
  return body.map((cells) => {
    const o = {};
    header.forEach((h, i) => {
      const col = columns.find((c) => c.name === h);
      const v = cells[i];
      o[h] = v === '' || v === undefined ? null
        : col.type === 'INTEGER' || col.type === 'NUMERIC' ? Number(v)
        : col.type === 'BOOLEAN' ? v === 'true'
        : v;
    });
    return o;
  });
}
