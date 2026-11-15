// CSV writer/reader driven by the schema (header = schema column order, LF endings, never CR).
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
const esc = (s) => {
  s = s.replace(/\r/g, '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const colCache = new Map();
const colsOf = (table) => {
  let c = colCache.get(table);
  if (!c) { c = parseSchema().tables[table].columns; colCache.set(table, c); }
  return c;
};

export const csvHeader = (table) => colsOf(table).map((c) => c.name).join(',') + '\n';
export const csvLine = (table, row) => colsOf(table).map((c) => esc(fmt(row[c.name], c))).join(',') + '\n';

// sort=true: rows sorted by primary key (engine results). sort=false: generation order (dataset files).
export function tableToCsv(table, rows, { sort = true } = {}) {
  let list = rows;
  if (sort) {
    const { pk } = parseSchema().tables[table];
    const key = (r) => pk.map((c) => String(r[c])).join('|');
    list = [...rows].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  }
  const out = [csvHeader(table)];
  for (const r of list) out.push(csvLine(table, r));
  return out.join('');
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
