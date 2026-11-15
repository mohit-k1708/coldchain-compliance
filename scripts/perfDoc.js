// docs/perf-results.json holds one section per measuring script; docs/PERFORMANCE.md is rendered from the whole JSON,
// so re-running one script never erases the others.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
export const RESULTS = resolve(root, 'docs/perf-results.json');
export const DOC = resolve(root, 'docs/PERFORMANCE.md');

export function readResults(file = RESULTS) {
  if (!existsSync(file)) return {};
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return {}; }
}

const mb = (b) => (b / 1048576).toFixed(2);
const sec = (ms) => (ms / 1000).toFixed(1);
const num = (n) => Number(n).toLocaleString('en-US');

export function renderPerf(r) {
  const L = ['# Performance', '', 'Generated from `docs/perf-results.json` by `scripts/perfDoc.js`. Each measuring script (`npm run perf`, `npm run db:build`, `npm run bench:api`) writes only its own section, so re-running one never erases the others.', ''];
  const p = r.perf;
  if (p) {
    L.push('## Pipeline (generate, validate, evaluate)', '',
      `Dataset: seed ${p.seed}, ${num(p.shipments)} shipments, ${num(p.loggers)} loggers. Node ${p.node}, default flags (no \`--max-old-space-size\`), ${p.platform}. Measured ${p.measured_at}.`, '',
      '| step | wall time | peak RSS | notes |', '|---|---:|---:|---|');
    for (const s of p.steps) L.push(`| ${s.name} | ${sec(s.wall_ms)} s | ${s.peak_rss_mb} MB | ${s.notes} |`);
    L.push('', p.evaluation_note, '');
    for (const [dir, files] of Object.entries(p.file_sizes ?? {})) {
      L.push(`### File sizes (${dir})`, '', '| file | MB |', '|---|---:|', ...Object.entries(files).map(([f, b]) => `| ${f} | ${mb(b)} |`), '');
    }
  } else L.push('## Pipeline', '', '_Not measured yet: run `npm run perf`._', '');
  const d = r.db_build;
  if (d) {
    L.push('## Database build', '', `Measured ${d.measured_at}.`, '',
      '| step | result |', '|---|---|',
      `| \`db:build\` | ${num(d.rows)} rows loaded in ${sec(d.load_ms)} s (${num(d.rows_per_s)} rows/s), indexes + foreign_key_check + workflow seeding + ANALYZE, ${sec(d.total_ms)} s in total, peak RSS ${d.peak_rss_mb} MB |`,
      `| database file | ${d.db_mb} MB (\`data/app.db\`, git-ignored) |`,
      `| seeded workflow | ${d.workflow} |`, '');
  } else L.push('## Database build', '', '_Not measured yet: run `npm run db:build`._', '');
  const a = r.api;
  if (a) {
    L.push('## API response times', '', `Measured ${a.measured_at}, ${a.runs} runs each, local machine, SQLite file DB, server and client in the same process.`, '',
      '| endpoint | ' + a.rows[0].ms.map((_, i) => `run ${i + 1} (ms)`).join(' | ') + ' |', '|---|' + a.rows[0].ms.map(() => '---:').join('|') + '|',
      ...a.rows.map((x) => `| ${x.name} | ${x.ms.join(' | ')} |`), '', '### Query plans (`EXPLAIN QUERY PLAN`)', '');
    for (const [name, steps] of Object.entries(a.plans)) L.push(`- **${name}**: ${steps.map((s) => `\`${s}\``).join('; ')}`);
    L.push('');
  } else L.push('## API response times', '', '_Not measured yet: run `npm run bench:api` against a built DB._', '');
  return L.join('\n');
}

// Merge ONE section into the JSON and re-render the markdown from the whole file.
export function recordPerf(section, data, { file = RESULTS, doc = DOC } = {}) {
  const all = readResults(file);
  all[section] = data;
  writeFileSync(file, JSON.stringify(all, null, 2) + '\n', 'utf8');
  writeFileSync(doc, renderPerf(all), 'utf8');
  return all;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeFileSync(DOC, renderPerf(readResults()), 'utf8');
  console.log(`rendered ${DOC}`);
}
