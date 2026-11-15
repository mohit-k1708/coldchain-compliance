// Parses database/schema.sql so column order, types, PKs and FKs have a single source of truth.
import { readFileSync } from 'node:fs';

let cached;
export function parseSchema() {
  if (cached) return cached;
  const sql = readFileSync(new URL('../database/schema.sql', import.meta.url), 'utf8');
  const order = [];
  const tables = {};
  const re = /CREATE TABLE (\w+) \(\n([\s\S]*?)\n\);/g;
  let m;
  while ((m = re.exec(sql))) {
    const t = { columns: [], pk: [], fks: [] };
    for (const raw of m[2].split('\n')) {
      const line = raw.trim().replace(/,$/, '');
      if (!line) continue;
      const tpk = line.match(/^PRIMARY KEY\s*\(([^)]+)\)/);
      if (tpk) { t.pk = tpk[1].split(',').map((s) => s.trim()); continue; }
      if (/^(UNIQUE|CHECK|FOREIGN|CONSTRAINT)\b/.test(line)) continue;
      const c = line.match(/^(\w+)\s+(TEXT|INTEGER|NUMERIC\((\d+),(\d+)\)|BOOLEAN|DATE|TIMESTAMPTZ)(?=\s|$)(.*)$/);
      if (!c) throw new Error(`schema parse: cannot read line in ${m[1]}: ${line}`);
      const type = c[2].startsWith('NUMERIC') ? 'NUMERIC' : c[2];
      t.columns.push({ name: c[1], type, scale: c[4] ? Number(c[4]) : null });
      if (/PRIMARY KEY/.test(c[5])) t.pk = [c[1]];
      const fk = c[5].match(/REFERENCES\s+(\w+)\((\w+)\)/);
      if (fk) t.fks.push({ col: c[1], table: fk[1], refCol: fk[2] });
    }
    order.push(m[1]);
    tables[m[1]] = t;
  }
  cached = { order, tables };
  return cached;
}
