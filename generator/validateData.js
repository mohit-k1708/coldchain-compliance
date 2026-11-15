import { readFileSync, writeFileSync, existsSync, openSync, readSync, closeSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseSchema } from './schema.js';
import { csvToRows, parseCsv } from './csv.js';
import { streamLines } from './csvStream.js';
import { ID_PATTERNS } from './idFormats.js';
import { readingId } from './ids.js';
import { parse, GRID, DAY, MIN } from './time.js';

const DATE_CHECKS = ['shipment.arrival_time<departure_time', 'shipment.planned_arrival<=planned_departure', 'logger_assignment.assigned_to<assigned_from',
  'custody_event.recorded_at<event_timestamp', 'route_stop.planned_departure<planned_arrival', 'route_stop.actual_departure<actual_arrival',
  'temperature_reading.received_at<recorded_at', 'excursion_report.end_time<start_time'];

// Bounded-memory pass over temperature_reading. Uniqueness uses a per-logger last timestamp while a logger's rows are
// monotonic; only loggers that are NOT monotonic get a Set (second pass).
export class ReadingScan {
  constructor({ loggerIds, assignById, watch }) {
    this.loggerIds = loggerIds; this.assignById = assignById; this.watch = watch; this.found = new Set();
    this.errors = []; this.count = 0; this.outside = 0; this.timesByAssign = new Map();
    this.last = new Map(); this.nonMono = new Set(); this.seen = new Map();
    this.enum = parseSchema().tables.temperature_reading.enums.reading_quality;
  }
  err(rule, id, msg, extra = {}) { this.errors.push({ rule, table: 'temperature_reading', id, msg, ...extra }); }
  add(r) {
    this.count++;
    const t = parse(r.recorded_at);
    if (!this.loggerIds.has(r.logger_id)) this.err('FK_INTEGRITY', r.reading_id, `logger_id=${r.logger_id} not in logger`, { fk: 'temperature_reading.logger_id->logger.logger_id' });
    if (r.logger_assignment_id !== null && !this.assignById.has(r.logger_assignment_id)) {
      this.err('FK_INTEGRITY', r.reading_id, `logger_assignment_id=${r.logger_assignment_id} not in logger_assignment`, { fk: 'temperature_reading.logger_assignment_id->logger_assignment.logger_assignment_id' });
    }
    if (!this.enum.includes(r.reading_quality)) this.err('ENUM', r.reading_id, `reading_quality=${r.reading_quality}`);
    if (!ID_PATTERNS.reading_id.test(r.reading_id)) this.err('ID_FORMAT', r.reading_id, 'reading_id format');
    else if (r.reading_id !== readingId(r.logger_id, t)) this.err('READING_ID_REBUILD', r.reading_id, 'reading_id != rebuilt from logger_id + recorded_at');
    if (parse(r.received_at) < t) this.err('DATE_ORDER', r.reading_id, 'received_at before recorded_at', { check: 'temperature_reading.received_at<recorded_at' });
    if (t % GRID !== 0) this.err('READING_GRID', r.reading_id, 'not on 10-minute grid');
    const last = this.last.get(r.logger_id);
    if (last === undefined || t > last) this.last.set(r.logger_id, t);
    else if (t === last) { this.err('READING_DUP', r.reading_id, 'duplicate (logger, recorded_at)'); this.err('PK_UNIQUE', r.reading_id, 'duplicate primary key'); }
    else this.nonMono.add(r.logger_id);
    if (this.watch.has(r.reading_id)) this.found.add(r.reading_id);
    const a = r.logger_assignment_id ? this.assignById.get(r.logger_assignment_id) : null;
    if (!a || a.logger_id !== r.logger_id || t < parse(a.assigned_from) || (a.assigned_to && t > parse(a.assigned_to))) this.outside++;
    if (a) {
      let arr = this.timesByAssign.get(a.shipment_id);
      if (!arr) { arr = []; this.timesByAssign.set(a.shipment_id, arr); }
      arr.push(t);
    }
  }
  needsSecondPass() { return this.nonMono.size > 0; }
  second(r) { // exact duplicate detection for non-monotonic loggers only
    if (!this.nonMono.has(r.logger_id)) return;
    let s = this.seen.get(r.logger_id);
    if (!s) { s = new Set(); this.seen.set(r.logger_id, s); }
    const t = parse(r.recorded_at);
    if (s.has(t)) { this.err('READING_DUP', r.reading_id, 'duplicate (logger, recorded_at)'); this.err('PK_UNIQUE', r.reading_id, 'duplicate primary key'); }
    s.add(t);
  }
}

function scanRows(tables) {
  const rows = (t) => tables[t] ?? [];
  const scan = new ReadingScan({
    loggerIds: new Set(rows('logger').map((l) => l.logger_id)),
    assignById: new Map(rows('logger_assignment').map((a) => [a.logger_assignment_id, a])),
    watch: new Set(rows('excursion_evidence').map((e) => e.reading_id)),
  });
  for (const r of rows('temperature_reading')) scan.add(r);
  if (scan.needsSecondPass()) for (const r of rows('temperature_reading')) scan.second(r);
  return scan;
}

// Integrity errors must be 0 on every dataset. Business observations are counted, NOT errors:
// they are the anomalies the compliance engine is supposed to find.
// opts.scan: a finished ReadingScan (streaming path); otherwise tables.temperature_reading is scanned here.
export function validateDataset(tables, { scan = null } = {}) {
  const { order, tables: schema } = parseSchema();
  const errors = [];
  const err = (rule, table, id, msg, extra = {}) => errors.push({ rule, table, id, msg, ...extra });
  const rows = (t) => tables[t] ?? [];
  const sc = scan ?? scanRows(tables);
  const counts = {};
  for (const t of order) counts[t] = rows(t).length;
  counts.temperature_reading = sc.count;
  const pkOf = (t, r) => schema[t].pk.map((c) => r[c]).join('|');
  const T = (s) => parse(s);
  const fkTotals = {};
  for (const t of order) for (const fk of schema[t].fks) fkTotals[`${t}.${fk.col}->${fk.table}.${fk.refCol}`] = 0;

  // --- integrity (readings are checked by the scan) ---------------------------------------------------------
  for (const t of order) {
    if (t === 'temperature_reading') continue;
    const seen = new Set();
    for (const r of rows(t)) {
      const k = pkOf(t, r);
      if (seen.has(k)) err('PK_UNIQUE', t, k, 'duplicate primary key'); else seen.add(k);
    }
  }
  const keySets = {};
  const keys = (t, c) => (keySets[`${t}.${c}`] ??= new Set(rows(t).map((r) => r[c])));
  for (const t of order) {
    if (t === 'temperature_reading') continue;
    for (const fk of schema[t].fks) {
      if (fk.table === 'temperature_reading') continue; // resolved by the scan (watch set)
      const ref = keys(fk.table, fk.refCol);
      for (const r of rows(t)) {
        const v = r[fk.col];
        if (v !== null && v !== undefined && !ref.has(v)) err('FK_INTEGRITY', t, pkOf(t, r), `${fk.col}=${v} not in ${fk.table}.${fk.refCol}`, { fk: `${t}.${fk.col}->${fk.table}.${fk.refCol}` });
      }
    }
    for (const r of rows(t)) {
      for (const [col, allowed] of Object.entries(schema[t].enums)) {
        if (r[col] !== null && r[col] !== undefined && !allowed.includes(r[col])) err('ENUM', t, pkOf(t, r), `${col}=${r[col]}`);
      }
      const check = (col, pat) => {
        const v = r[col];
        if (pat && v !== null && v !== undefined && !pat.test(v)) err('ID_FORMAT', t, pkOf(t, r), `${col}=${v}`);
      };
      for (const c of schema[t].pk) check(c, ID_PATTERNS[c]);
      for (const fk of schema[t].fks) check(fk.col, ID_PATTERNS[fk.refCol]);
    }
  }
  for (const id of sc.watch) {
    if (!sc.found.has(id)) err('FK_INTEGRITY', 'excursion_evidence', id, `reading_id=${id} not in temperature_reading`, { fk: 'excursion_evidence.reading_id->temperature_reading.reading_id' });
  }
  const dateOrder = (t, r, id, a, b, strict, check) => {
    if (r[a] && r[b] && (strict ? T(r[b]) <= T(r[a]) : T(r[b]) < T(r[a]))) err('DATE_ORDER', t, id, `${b} before ${a}`, { check });
  };
  for (const s of rows('shipment')) {
    dateOrder('shipment', s, s.shipment_id, 'departure_time', 'arrival_time', false, 'shipment.arrival_time<departure_time');
    dateOrder('shipment', s, s.shipment_id, 'planned_departure', 'planned_arrival', true, 'shipment.planned_arrival<=planned_departure');
  }
  for (const a of rows('logger_assignment')) dateOrder('logger_assignment', a, a.logger_assignment_id, 'assigned_from', 'assigned_to', false, 'logger_assignment.assigned_to<assigned_from');
  for (const c of rows('custody_event')) dateOrder('custody_event', c, c.custody_event_id, 'event_timestamp', 'recorded_at', false, 'custody_event.recorded_at<event_timestamp');
  for (const r of rows('route_stop')) {
    dateOrder('route_stop', r, r.route_stop_id, 'planned_arrival', 'planned_departure', false, 'route_stop.planned_departure<planned_arrival');
    dateOrder('route_stop', r, r.route_stop_id, 'actual_arrival', 'actual_departure', false, 'route_stop.actual_departure<actual_arrival');
  }
  const evCount = new Map();
  for (const e of rows('excursion_evidence')) evCount.set(e.excursion_id, (evCount.get(e.excursion_id) ?? 0) + 1);
  for (const x of rows('excursion_report')) {
    dateOrder('excursion_report', x, x.excursion_id, 'start_time', 'end_time', false, 'excursion_report.end_time<start_time');
    if (x.start_time && x.end_time && x.duration_minutes !== (T(x.end_time) - T(x.start_time)) / MIN) err('EXCURSION_DURATION', 'excursion_report', x.excursion_id, 'duration_minutes != end - start');
    if (evCount.has(x.excursion_id) && x.duration_minutes !== evCount.get(x.excursion_id) * 10) err('EXCURSION_DURATION', 'excursion_report', x.excursion_id, 'duration_minutes != 10 * evidence readings');
  }
  errors.push(...sc.errors);

  // --- business observations (shipment-level sets) -------------------------------------------------------
  const obs = { assignmentOverlap: new Set(), noCoveringAssignment: new Set(), custodyDiscontinuity: new Set(),
    routeMismatch: new Set(), readingGap: new Set(), policyMismatch: new Set(), expiredCalibration: new Set() };
  const shipById = new Map(rows('shipment').map((s) => [s.shipment_id, s]));
  const polById = new Map(rows('threshold_policy').map((p) => [p.policy_id, p]));
  const assignsByShip = new Map();
  for (const a of rows('logger_assignment')) {
    if (!assignsByShip.has(a.shipment_id)) assignsByShip.set(a.shipment_id, []);
    assignsByShip.get(a.shipment_id).push(a);
  }
  const byLogger = new Map();
  for (const a of rows('logger_assignment')) {
    if (a.assignment_status === 'CANCELLED') continue;
    if (!byLogger.has(a.logger_id)) byLogger.set(a.logger_id, []);
    byLogger.get(a.logger_id).push(a);
  }
  for (const list of byLogger.values()) {
    list.sort((x, y) => T(x.assigned_from) - T(y.assigned_from));
    for (let i = 1; i < list.length; i++) {
      const prevTo = list[i - 1].assigned_to ? T(list[i - 1].assigned_to) : Infinity;
      if (prevTo > T(list[i].assigned_from)) { obs.assignmentOverlap.add(list[i].shipment_id); obs.assignmentOverlap.add(list[i - 1].shipment_id); }
    }
  }
  for (const s of rows('shipment')) {
    const dep = T(s.departure_time), arr = T(s.arrival_time);
    const ok = (assignsByShip.get(s.shipment_id) ?? []).some((a) => a.assignment_status !== 'CANCELLED'
      && T(a.assigned_from) <= dep && (a.assigned_to === null || T(a.assigned_to) >= arr));
    if (!ok) obs.noCoveringAssignment.add(s.shipment_id);
  }
  for (const [sid, times] of sc.timesByAssign) {
    const pol = polById.get(shipById.get(sid)?.policy_id);
    if (!pol) continue;
    times.sort((x, y) => x - y);
    for (let i = 1; i < times.length; i++) if ((times[i] - times[i - 1]) / MIN > pol.max_data_gap_minutes) { obs.readingGap.add(sid); break; }
  }
  const custByShip = new Map();
  for (const c of rows('custody_event')) {
    if (!custByShip.has(c.shipment_id)) custByShip.set(c.shipment_id, []);
    custByShip.get(c.shipment_id).push(c);
  }
  for (const s of rows('shipment')) {
    const ev = (custByShip.get(s.shipment_id) ?? []).sort((a, b) => a.event_sequence - b.event_sequence);
    let bad = ev.length === 0 || ev[0].event_type !== 'PICKUP' || ev.at(-1).event_type !== 'DELIVERY';
    ev.forEach((e, i) => {
      if (e.event_sequence !== i + 1 || !e.from_party_id || !e.to_party_id) bad = true;
      if (i > 0 && ev[i - 1].to_party_id !== e.from_party_id) bad = true;
    });
    if (bad) obs.custodyDiscontinuity.add(s.shipment_id);
  }
  const stopsByShip = new Map();
  for (const r of rows('route_stop')) {
    if (!stopsByShip.has(r.shipment_id)) stopsByShip.set(r.shipment_id, []);
    stopsByShip.get(r.shipment_id).push(r);
  }
  // dwell is judged against the policy EFFECTIVE at departure for the product (the applied policy may be the wrong one)
  const polsByProduct = new Map();
  for (const p of rows('threshold_policy')) { if (!polsByProduct.has(p.product_id)) polsByProduct.set(p.product_id, []); polsByProduct.get(p.product_id).push(p); }
  const effectivePolicy = (sh) => (polsByProduct.get(sh.product_id) ?? []).find((p) => T(p.effective_from) <= T(sh.departure_time) && (!p.effective_to || T(sh.departure_time) < T(p.effective_to))) ?? polById.get(sh.policy_id);
  for (const [sid, stops] of stopsByShip) {
    const pol = shipById.has(sid) ? effectivePolicy(shipById.get(sid)) : undefined;
    let bad = false;
    for (const st of stops) {
      if (st.stop_sequence !== null && st.actual_arrival === null) bad = true;
      if (st.stop_sequence === null) bad = true;
      if (pol && st.actual_arrival && st.actual_departure && (T(st.actual_departure) - T(st.actual_arrival)) / MIN > pol.max_dwell_minutes) bad = true;
    }
    const planned = stops.filter((s) => s.stop_sequence !== null && s.actual_sequence !== null).sort((a, b) => a.stop_sequence - b.stop_sequence);
    for (let i = 1; i < planned.length; i++) if (planned[i].actual_sequence < planned[i - 1].actual_sequence) bad = true;
    if (bad) obs.routeMismatch.add(sid);
  }
  const calsByLogger = new Map();
  for (const c of rows('logger_calibration')) {
    if (!calsByLogger.has(c.logger_id)) calsByLogger.set(c.logger_id, []);
    calsByLogger.get(c.logger_id).push(c);
  }
  for (const s of rows('shipment')) {
    const p = polById.get(s.policy_id), dep = T(s.departure_time);
    if (!p || p.product_id !== s.product_id || T(p.effective_from) > dep || (p.effective_to && T(p.effective_to) <= dep)) obs.policyMismatch.add(s.shipment_id);
    for (const a of assignsByShip.get(s.shipment_id) ?? []) {
      const valid = (calsByLogger.get(a.logger_id) ?? []).some((c) => T(c.calibrated_on) <= dep && dep < T(c.expires_on) + DAY);
      if (!valid) obs.expiredCalibration.add(s.shipment_id);
    }
  }

  const n = (rule) => errors.filter((e) => e.rule === rule).length;
  const fk = { ...fkTotals };
  for (const e of errors) if (e.rule === 'FK_INTEGRITY' && e.fk) fk[e.fk] = (fk[e.fk] ?? 0) + 1;
  const dates = Object.fromEntries(DATE_CHECKS.map((c) => [c, 0]));
  for (const e of errors) if (e.rule === 'DATE_ORDER' && e.check) dates[e.check] = (dates[e.check] ?? 0) + 1;
  const observations = Object.fromEntries(Object.entries(obs).map(([k, v]) => [k, [...v].sort()]));
  return {
    errors, observations,
    summary: {
      counts,
      integrity: {
        duplicatePKs: n('PK_UNIQUE'), invalidFKs: n('FK_INTEGRITY'), invalidEnums: n('ENUM'), badIdFormats: n('ID_FORMAT'),
        invalidDates: n('DATE_ORDER'), offGridReadings: n('READING_GRID'), duplicateReadings: n('READING_DUP'),
        readingIdMismatch: n('READING_ID_REBUILD'), excursionDurationMismatch: n('EXCURSION_DURATION'), totalErrors: errors.length,
      },
      fk, dates,
      observations: { ...Object.fromEntries(Object.entries(observations).map(([k, v]) => [k, v.length])), readingsOutsideAssignment: sc.outside },
    },
  };
}

// ---- directory validation (streaming for temperature_reading) ----------------------------------------------
export function loadDir(dir, { skip = [] } = {}) {
  const tables = {};
  for (const t of parseSchema().order) {
    const f = resolve(dir, `${t}.csv`);
    tables[t] = skip.includes(t) || !existsSync(f) ? [] : csvToRows(t, readFileSync(f, 'utf8'));
  }
  return tables;
}

export function hashFile(file) {
  const fd = openSync(file, 'r');
  const buf = Buffer.allocUnsafe(1 << 20);
  const h = createHash('sha256');
  let lines = 0;
  try {
    for (;;) {
      const nread = readSync(fd, buf, 0, buf.length, null);
      if (nread === 0) break;
      h.update(buf.subarray(0, nread));
      for (let i = 0; i < nread; i++) if (buf[i] === 10) lines++;
    }
  } finally { closeSync(fd); }
  return { sha256: h.digest('hex'), rows: Math.max(0, lines - 1) };
}

// Observation -> ground-truth labels expected to produce it.
export const OBS_LABELS = {
  assignmentOverlap: [], noCoveringAssignment: ['LOGGER_NOT_ASSIGNED'], custodyDiscontinuity: ['CUSTODY_GAP'],
  routeMismatch: ['ROUTE_DEVIATION'], readingGap: ['MISSING_DATA', 'MISSING_DATA_SILENTLY_PASSED'],
  policyMismatch: ['POLICY_MISMATCH'], expiredCalibration: ['CALIBRATION_EXPIRED'],
};

export function compareWithGroundTruth(observations, gt) {
  const out = {};
  for (const [k, labels] of Object.entries(OBS_LABELS)) {
    const expected = gt.filter((g) => labels.includes(g.label)).map((g) => g.id).sort();
    out[k] = { observed: observations[k].length, ground_truth: expected.length, labels, match: JSON.stringify(expected) === JSON.stringify(observations[k]) };
  }
  return out;
}

export function validateDir(dir) {
  const tables = loadDir(dir, { skip: ['temperature_reading'] });
  const scan = new ReadingScan({
    loggerIds: new Set(tables.logger.map((l) => l.logger_id)),
    assignById: new Map(tables.logger_assignment.map((a) => [a.logger_assignment_id, a])),
    watch: new Set(tables.excursion_evidence.map((e) => e.reading_id)),
  });
  const file = resolve(dir, 'temperature_reading.csv');
  const colNames = [];
  const cols = parseSchema().tables.temperature_reading.columns;
  const stream = (cb) => {
    let header = null;
    streamLines(file, (line) => {
      const c = line.split(',');
      if (!header) { header = c; return; }
      const r = {};
      for (let i = 0; i < header.length; i++) {
        const col = cols[i];
        const v = c[i];
        r[header[i]] = v === '' ? null : col.type === 'NUMERIC' || col.type === 'INTEGER' ? Number(v) : v;
      }
      cb(r);
    });
  };
  void colNames;
  stream((r) => scan.add(r));
  if (scan.needsSecondPass()) stream((r) => scan.second(r));
  const result = validateDataset(tables, { scan });

  // file checksums and row counts vs manifest
  const files = {};
  for (const t of parseSchema().order) { const f = resolve(dir, `${t}.csv`); if (existsSync(f)) files[`${t}.csv`] = hashFile(f); }
  const gtFile = resolve(dir, 'ground_truth.csv');
  let gt = [];
  if (existsSync(gtFile)) { files['ground_truth.csv'] = hashFile(gtFile); gt = parseCsv(readFileSync(gtFile, 'utf8')).slice(1).filter((r) => r.length > 1).map((r) => ({ id: r[0], label: r[1] })); }
  const mf = existsSync(resolve(dir, 'manifest.json')) ? JSON.parse(readFileSync(resolve(dir, 'manifest.json'), 'utf8')) : null;
  const manifestProblems = [];
  if (mf) {
    for (const [name, v] of Object.entries(files)) {
      const m = mf.files[name];
      if (!m) manifestProblems.push(`${name} missing from manifest`);
      else if (m.sha256 !== v.sha256 || m.rows !== v.rows) manifestProblems.push(`${name} differs from manifest`);
    }
  }
  const labelCounts = {};
  for (const g of gt) labelCounts[g.label] = (labelCounts[g.label] ?? 0) + 1;
  const obsVsTruth = gt.length ? compareWithGroundTruth(result.observations, gt) : null;
  const integrityPass = result.errors.length === 0 && manifestProblems.length === 0;
  return { ...result, manifest: mf, files, manifestProblems, labelCounts, obsVsTruth, integrityPass };
}

const FAILED_RULES = ['PK_UNIQUE', 'FK_INTEGRITY', 'ENUM', 'ID_FORMAT', 'DATE_ORDER', 'READING_GRID', 'READING_DUP', 'READING_ID_REBUILD', 'EXCURSION_DURATION'];

export function buildReport(v) {
  const failedRules = Object.fromEntries(FAILED_RULES.map((r) => [r, v.errors.filter((e) => e.rule === r).length]));
  return {
    integrity_result: v.integrityPass ? 'PASS' : 'FAIL',
    configuration: v.manifest ? { seed: v.manifest.seed, shipments: v.manifest.shipments, loggers: v.manifest.loggers, mix: v.manifest.mix, generator_version: v.manifest.generator_version } : null,
    record_counts: v.summary.counts,
    duplicate_primary_keys: v.summary.integrity.duplicatePKs,
    invalid_foreign_keys: v.summary.fk,
    missing_references_total: v.summary.integrity.invalidFKs,
    invalid_date_orderings: v.summary.dates,
    failed_rules: failedRules,
    manifest_problems: v.manifestProblems,
    sha256: Object.fromEntries(Object.entries(v.files).map(([k, f]) => [k, f.sha256])),
    business_observations_vs_ground_truth: v.obsVsTruth,
    readings_outside_assignment: v.summary.observations.readingsOutsideAssignment,
    ground_truth_label_counts: v.labelCounts,
  };
}

export function renderMarkdown(rep) {
  const L = [];
  const cfg = rep.configuration;
  L.push('# Validation summary', '', `**Integrity: ${rep.integrity_result}**`, '');
  if (cfg) L.push('## Generator configuration', '', '| key | value |', '|---|---|', ...Object.entries(cfg).map(([k, v]) => `| ${k} | ${v} |`), '');
  L.push('## Record counts', '', '| table | rows |', '|---|---:|', ...Object.entries(rep.record_counts).map(([k, v]) => `| ${k} | ${v} |`), '');
  L.push('## Integrity checks (all expected 0)', '', `- duplicate primary keys: ${rep.duplicate_primary_keys}`, `- missing references (invalid FKs, total): ${rep.missing_references_total}`, '');
  L.push('### Invalid foreign keys per FK', '', '| foreign key | invalid |', '|---|---:|', ...Object.entries(rep.invalid_foreign_keys).map(([k, v]) => `| ${k} | ${v} |`), '');
  L.push('### Invalid date orderings', '', '| check | violations |', '|---|---:|', ...Object.entries(rep.invalid_date_orderings).map(([k, v]) => `| ${k} | ${v} |`), '');
  L.push('### Failed rules by name', '', '| rule | failures |', '|---|---:|', ...Object.entries(rep.failed_rules).map(([k, v]) => `| ${k} | ${v} |`), '');
  if (rep.manifest_problems.length) L.push('Manifest problems:', ...rep.manifest_problems.map((p) => `- ${p}`), '');
  if (rep.business_observations_vs_ground_truth) {
    L.push('## Business observations vs ground truth (shipments; exact set match expected)', '', '| observation | observed | ground truth | labels | match |', '|---|---:|---:|---|---|',
      ...Object.entries(rep.business_observations_vs_ground_truth).map(([k, v]) => `| ${k} | ${v.observed} | ${v.ground_truth} | ${v.labels.join(' + ') || '(none expected)'} | ${v.match ? 'MATCH' : 'DIFF'} |`),
      '', `Readings outside their assignment window (count of readings, expected for unassigned/truncated shipments): ${rep.readings_outside_assignment}`, '');
    L.push('### Ground-truth label counts', '', '| label | shipments |', '|---|---:|', ...Object.entries(rep.ground_truth_label_counts).sort().map(([k, v]) => `| ${k} | ${v} |`), '');
  }
  L.push('## sha256 per file', '', '| file | sha256 |', '|---|---|', ...Object.entries(rep.sha256).map(([k, v]) => `| ${k} | \`${v}\` |`), '');
  L.push(`**Integrity: ${rep.integrity_result}**`, '');
  return L.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
  const dir = args.in ?? args.dir ?? 'data/generated';
  const t0 = performance.now();
  const v = validateDir(dir);
  const rep = buildReport(v);
  console.log('INTEGRITY', JSON.stringify(v.summary.integrity));
  for (const e of v.errors.slice(0, 20)) console.log(`  ${e.rule} ${e.table} ${e.id}: ${e.msg}`);
  if (v.manifestProblems.length) console.log('MANIFEST', v.manifestProblems.join('; '));
  if (v.obsVsTruth) {
    console.log('BUSINESS OBSERVATIONS (shipments)  observed | ground-truth');
    for (const [k, o] of Object.entries(v.obsVsTruth)) console.log(`  ${k.padEnd(22)} ${String(o.observed).padStart(5)} | ${String(o.ground_truth).padStart(5)}  ${o.labels.join('+') || '(none expected)'}  ${o.match ? 'MATCH' : 'DIFF'}`);
    console.log(`  readingsOutsideAssignment (readings): ${v.summary.observations.readingsOutsideAssignment}`);
    console.log('GROUND TRUTH LABELS', JSON.stringify(v.labelCounts));
  }
  console.log(`INTEGRITY ${rep.integrity_result}`);
  if (args.out) {
    mkdirSync(dirname(resolve(args.out)), { recursive: true });
    writeFileSync(resolve(args.out), renderMarkdown(rep), 'utf8');
    writeFileSync(resolve(args.out.replace(/\.md$/, '') + '.json'), JSON.stringify(rep, null, 2) + '\n', 'utf8');
  }
  console.log(JSON.stringify({ step: 'validate', elapsed_ms: Math.round(performance.now() - t0), peak_rss_mb: Math.round(process.resourceUsage().maxRSS / 1024) }));
  process.exit(v.integrityPass ? 0 : 1);
}
