// Distribution statistics of a generated dataset -> docs/DISTRIBUTIONS.md
import { writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDir } from '../generator/validateData.js';
import { streamRows } from '../generator/csvStream.js';
import { csvToRows } from '../generator/csv.js';
import { readFileSync } from 'node:fs';
import { parse, MIN, HOUR } from '../generator/time.js';
import { DEFAULT_MIX } from '../generator/plan.js';

const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '-');
const mmm = (a) => (a.length ? `${Math.min(...a)} / ${f2(a.reduce((s, x) => s + x, 0) / a.length)} / ${Math.max(...a)}` : '-');
function hist(values, edges, unit = '') {
  const bins = edges.map((e, i) => ({ label: i === edges.length - 1 ? `>= ${e}${unit}` : `${e}-${edges[i + 1]}${unit}`, n: 0 }));
  for (const v of values) { let i = edges.length - 1; while (i > 0 && v < edges[i]) i--; bins[i].n++; }
  return ['| bin | count |', '|---|---:|', ...bins.map((b) => `| ${b.label} | ${b.n} |`)];
}

export function computeStats(dir, resultsDir = null) {
  const t = loadDir(dir, { skip: ['temperature_reading'] });
  const shipById = new Map(t.shipment.map((s) => [s.shipment_id, s]));
  const prodName = new Map(t.product.map((p) => [p.product_id, p.product_name]));
  const asgShip = new Map(t.logger_assignment.map((a) => [a.logger_assignment_id, a.shipment_id]));
  const welford = new Map(); // product -> {n, mean, m2}
  const perShip = new Map(); // shipment -> {n, last, gaps}
  const gapLimit = new Map(t.threshold_policy.map((p) => [p.policy_id, p.max_data_gap_minutes]));
  streamRows('temperature_reading', resolve(dir, 'temperature_reading.csv'), (r) => {
    const sid = r.logger_assignment_id ? asgShip.get(r.logger_assignment_id) : null;
    if (!sid) return;
    const s = shipById.get(sid);
    const w = welford.get(s.product_id) ?? { n: 0, mean: 0, m2: 0 };
    w.n++; const d = r.temperature_c - w.mean; w.mean += d / w.n; w.m2 += d * (r.temperature_c - w.mean);
    welford.set(s.product_id, w);
    const p = perShip.get(sid) ?? { n: 0, last: null, gaps: 0 };
    const tt = parse(r.recorded_at);
    if (p.last !== null && (tt - p.last) / MIN > gapLimit.get(s.policy_id)) p.gaps++;
    p.last = tt; p.n++;
    perShip.set(sid, p);
  });
  const perLogger = new Map();
  for (const a of t.logger_assignment) perLogger.set(a.logger_id, (perLogger.get(a.logger_id) ?? 0) + 1);
  const byProduct = new Map();
  for (const s of t.shipment) byProduct.set(s.product_id, (byProduct.get(s.product_id) ?? 0) + 1);
  const dwell = t.route_stop.filter((r) => r.actual_arrival && r.actual_departure).map((r) => (parse(r.actual_departure) - parse(r.actual_arrival)) / MIN);
  const legacy = t.excursion_report.filter((x) => x.source === 'LEGACY_IMPORT');
  const gt = existsSync(resolve(dir, 'ground_truth.csv')) ? csvToRows2(resolve(dir, 'ground_truth.csv')) : [];
  const engine = resultsDir && existsSync(resolve(resultsDir, 'excursion_report.csv')) ? csvToRows('excursion_report', readFileSync(resolve(resultsDir, 'excursion_report.csv'), 'utf8')) : null;
  return { t, welford, perShip, perLogger, byProduct, prodName, dwell, legacy, gt, engine };
}
function csvToRows2(file) {
  const [h, ...rows] = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => l.split(','));
  return rows.map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]])));
}

export function renderStats(s, dir) {
  const { t } = s;
  const L = ['# Distributions', '', `Computed from \`${dir}\` (${t.shipment.length} shipments, ${t.logger.length} loggers).`, ''];
  L.push('## Shipments per product', '', '| product | shipments |', '|---|---:|', ...[...s.byProduct].sort().map(([p, n]) => `| ${s.prodName.get(p)} | ${n} |`), '');
  const dur = t.shipment.map((x) => (parse(x.arrival_time) - parse(x.departure_time)) / HOUR);
  L.push('## Shipment duration (hours, actual departure to arrival)', '', `min / mean / max: ${mmm(dur.map((x) => +x.toFixed(2)))}`, '', ...hist(dur, [12, 18, 24, 30, 36, 42, 48, 54, 60, 66, 72, 78], ' h'), '');
  const delay = t.shipment.map((x) => (parse(x.arrival_time) - parse(x.planned_arrival)) / MIN);
  L.push('## Arrival delay vs plan (minutes)', '', `min / mean / max: ${mmm(delay)}`, '', ...hist(delay, [0, 10, 30, 60, 120, 240], ' min'), '');
  const counts = [...s.perShip.values()].map((x) => x.n);
  L.push('## Readings per shipment (min / mean / max)', '', `${mmm(counts)} (shipments with an assignment: ${counts.length})`, '');
  L.push('## Temperature per product (all readings of assigned shipments)', '', '| product | readings | mean C | sd C |', '|---|---:|---:|---:|',
    ...[...s.welford].sort().map(([p, w]) => `| ${s.prodName.get(p)} | ${w.n} | ${f2(w.mean)} | ${f2(Math.sqrt(w.m2 / Math.max(1, w.n - 1)))} |`), '');
  const used = [...s.perLogger.values()];
  L.push('## Shipments per logger (min / mean / max over loggers with assignments)', '', `${mmm(used)}; loggers with no assignment: ${t.logger.length - used.length}`, '');
  const byType = {};
  for (const x of s.legacy) byType[x.issue_type] = (byType[x.issue_type] ?? 0) + 1;
  L.push('## Legacy excursion reports', '', `Total: ${s.legacy.length}`, '', '| issue_type | count |', '|---|---:|', ...Object.entries(byType).sort().map(([k, v]) => `| ${k} | ${v} |`), '',
    'Duration (minutes):', '', ...hist(s.legacy.map((x) => x.duration_minutes), [0, 10, 20, 30, 60, 120]), '');
  if (s.engine) {
    const e = {};
    for (const x of s.engine) e[x.issue_type] = (e[x.issue_type] ?? 0) + 1;
    L.push('## Engine excursion reports (data/results)', '', `Total: ${s.engine.length}`, '', '| issue_type | count |', '|---|---:|', ...Object.entries(e).sort().map(([k, v]) => `| ${k} | ${v} |`), '');
  }
  const gaps = [...s.perShip.values()];
  L.push('## Data gaps (spacing above the policy gap limit)', '', `Shipments with at least one gap: ${gaps.filter((g) => g.gaps > 0).length}; total gaps: ${gaps.reduce((a, g) => a + g.gaps, 0)}`, '');
  L.push('## Stop dwell time (minutes)', '', `min / mean / max: ${mmm(s.dwell)}`, '', ...hist(s.dwell, [0, 15, 30, 45, 60, 90, 120]), '');
  const actual = {};
  for (const g of s.gt) actual[g.issue_type] = (actual[g.issue_type] ?? 0) + 1;
  const total = Object.values(DEFAULT_MIX).reduce((a, b) => a + b, 0);
  L.push('## Label counts vs configured mix', '', '| label | configured % | expected (N x %) | actual |', '|---|---:|---:|---:|',
    ...Object.entries(DEFAULT_MIX).map(([k, p]) => `| ${k} | ${p} | ${f2((t.shipment.length * p) / total)} | ${actual[k] ?? 0} |`),
    '', 'Counts use largest-remainder rounding; with at least 100 shipments every non-NONE label has at least 2, and CROSS_SHIPMENT_EXCURSION is always an even number (pairs). The difference is taken from NONE.', '');
  return L.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
  const dir = args.in ?? 'data/generated';
  const md = renderStats(computeStats(dir, args.results ?? 'data/results'), dir);
  writeFileSync(resolve(args.out ?? 'docs/DISTRIBUTIONS.md'), md, 'utf8');
  console.log(`wrote ${args.out ?? 'docs/DISTRIBUTIONS.md'}`);
  console.log(JSON.stringify({ step: 'stats', peak_rss_mb: Math.round(process.resourceUsage().maxRSS / 1024) }));
}
