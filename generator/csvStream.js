// Synchronous chunked CSV reading: bounded memory regardless of file size.
import { openSync, readSync, closeSync } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';
import { parseSchema } from './schema.js';
import { parseCsv } from './csv.js';

export function streamLines(file, onLine) {
  const fd = openSync(file, 'r');
  const buf = Buffer.allocUnsafe(1 << 20);
  const dec = new StringDecoder('utf8');
  let rest = '';
  try {
    for (;;) {
      const n = readSync(fd, buf, 0, buf.length, null);
      if (n === 0) break;
      const text = rest + dec.write(buf.subarray(0, n));
      let start = 0, i;
      while ((i = text.indexOf('\n', start)) !== -1) { onLine(text.slice(start, i)); start = i + 1; }
      rest = text.slice(start);
    }
    rest += dec.end();
    if (rest) onLine(rest);
  } finally { closeSync(fd); }
}

// Calls onRow(typedRow) per data row. Returns the row count.
export function streamRows(table, file, onRow) {
  const cols = parseSchema().tables[table].columns;
  let header = null, count = 0;
  streamLines(file, (line) => {
    const cells = line.includes('"') ? parseCsv(line + '\n')[0] : line.split(',');
    if (!header) { header = cells.map((h) => cols.find((c) => c.name === h)); return; }
    const o = {};
    for (let i = 0; i < header.length; i++) {
      const c = header[i], v = cells[i];
      o[c.name] = v === '' || v === undefined ? null
        : c.type === 'INTEGER' || c.type === 'NUMERIC' ? Number(v)
        : c.type === 'BOOLEAN' ? v === 'true' : v;
    }
    count++;
    onRow(o);
  });
  return count;
}
