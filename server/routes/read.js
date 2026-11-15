import { Router } from 'express';
import { all, get } from '../db.js';
import { wrap, notFound, badRequest, paging, oneOf } from '../http.js';
import { loadSlice } from '../loadSlice.js';
import { buildReport, renderMarkdown, renderHtml } from '../../engine/report.js';
import { classifyReading } from '../../engine/evaluators/temperature.js';
import { ms } from '../../engine/time.js';
import { DEFAULT_AS_OF } from '../../engine/index.js';

const COMPLIANCE = ['COMPLIANT', 'NON_COMPLIANT', 'INDETERMINATE'];
const SHIP_STATUS = ['PLANNED', 'PACKED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'];
const EXC_STATUS = ['OPEN', 'ASSIGNED', 'INVESTIGATING', 'RESOLVED', 'ESCALATED'];
const SEVERITY = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const ISSUES = ['TEMP_HIGH', 'TEMP_LOW', 'MISSING_DATA', 'LOGGER_NOT_ASSIGNED', 'CALIBRATION_INVALID', 'ASSIGNMENT_OVERLAP', 'POLICY_MISMATCH', 'CUSTODY_GAP', 'ROUTE_DEVIATION', 'CROSS_SHIPMENT_REPORT', 'CALIBRATION_MARGINAL'];
const SORTS = { id: 's.shipment_id ASC', '-id': 's.shipment_id DESC', departure: 's.departure_time ASC, s.shipment_id', '-departure': 's.departure_time DESC, s.shipment_id', status: 'r.compliance_status ASC, s.shipment_id', '-status': 'r.compliance_status DESC, s.shipment_id' };
const likeEscape = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const countBy = (rows, key) => Object.fromEntries(rows.map((r) => [r[key], r.n]));

export function readRoutes(db) {
  const r = Router();

  r.get('/health', wrap((req, res) => {
    res.json({ ok: true, db: {
      shipment: get(db, 'SELECT count(*) n FROM shipment').n, temperature_reading: get(db, 'SELECT count(*) n FROM temperature_reading').n,
      compliance_run: get(db, 'SELECT count(*) n FROM compliance_run').n } });
  }));

  r.get('/dashboard', wrap((req, res) => {
    const one = (sql, ...p) => get(db, sql, ...p).n;
    const status = countBy(all(db, 'SELECT compliance_status s, count(*) n FROM compliance_run WHERE is_current = 1 GROUP BY compliance_status'), 's');
    const eng = "source = 'ENGINE'";
    res.json({
      total_shipments: one('SELECT count(*) n FROM shipment'),
      evaluated: one("SELECT count(*) n FROM shipment WHERE shipment_status = 'DELIVERED'"),
      compliant: status.COMPLIANT ?? 0, non_compliant: status.NON_COMPLIANT ?? 0, indeterminate: status.INDETERMINATE ?? 0,
      open_exceptions: one(`SELECT count(*) n FROM excursion_report WHERE ${eng} AND status != 'RESOLVED'`),
      exceptions_by_status: countBy(all(db, `SELECT status s, count(*) n FROM excursion_report WHERE ${eng} GROUP BY status`), 's'),
      exceptions_by_severity: countBy(all(db, `SELECT severity s, count(*) n FROM excursion_report WHERE ${eng} GROUP BY severity`), 's'),
      temperature_excursion_runs: one(`SELECT count(*) n FROM excursion_report WHERE ${eng} AND issue_type IN ('TEMP_HIGH','TEMP_LOW')`),
      data_gaps: one(`SELECT count(*) n FROM excursion_report WHERE ${eng} AND issue_type = 'MISSING_DATA'`),
      by_issue_type: countBy(all(db, `SELECT issue_type s, count(*) n FROM excursion_report WHERE ${eng} GROUP BY issue_type`), 's'),
      top_reasons: all(db, `SELECT substr(reason_summary, instr(reason_summary, '[') + 1, instr(reason_summary, ']') - instr(reason_summary, '[') - 1) AS rule, count(*) AS n
        FROM compliance_run WHERE is_current = 1 GROUP BY rule ORDER BY n DESC, rule LIMIT 10`),
      by_product: all(db, `SELECT p.product_id, p.product_name, r.compliance_status AS status, count(*) AS n FROM compliance_run r
        JOIN shipment s ON s.shipment_id = r.shipment_id JOIN product p ON p.product_id = s.product_id WHERE r.is_current = 1
        GROUP BY p.product_id, r.compliance_status ORDER BY p.product_id, r.compliance_status`),
    });
  }));

  r.get('/shipments', wrap((req, res) => {
    const q = req.query;
    const { page, pageSize, offset } = paging(q);
    const where = [], p = [];
    const cs = oneOf(q.status, COMPLIANCE, 'status'); if (cs) { where.push('r.compliance_status = ?'); p.push(cs); }
    const ss = oneOf(q.shipmentStatus, SHIP_STATUS, 'shipmentStatus'); if (ss) { where.push('s.shipment_status = ?'); p.push(ss); }
    if (q.productId !== undefined && q.productId !== '') { where.push('s.product_id = ?'); p.push(String(q.productId)); }
    if (q.q !== undefined && q.q !== '') { where.push("s.shipment_id LIKE ? ESCAPE '\\'"); p.push(`${likeEscape(String(q.q))}%`); }
    const sort = q.sort === undefined ? 'id' : q.sort;
    if (!SORTS[sort]) throw badRequest(`sort must be one of ${Object.keys(SORTS).join(', ')}`);
    const from = `FROM shipment s JOIN product p ON p.product_id = s.product_id LEFT JOIN compliance_run r ON r.shipment_id = s.shipment_id AND r.is_current = 1
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`;
    const total = get(db, `SELECT count(*) n ${from}`, ...p).n;
    const items = all(db, `SELECT s.shipment_id AS id, p.product_name AS product, p.product_id,
        (SELECT group_concat(sl.lot_id, ',') FROM shipment_lot sl WHERE sl.shipment_id = s.shipment_id) AS lot_ids,
        s.origin_location, s.destination_location,
        (SELECT a.logger_id FROM logger_assignment a WHERE a.shipment_id = s.shipment_id ORDER BY a.assigned_from LIMIT 1) AS logger_id,
        s.shipment_status, r.compliance_status, r.reason_summary ${from} ORDER BY ${SORTS[sort]} LIMIT ? OFFSET ?`, ...p, pageSize, offset)
      .map((x) => ({ ...x, lot_ids: x.lot_ids ? x.lot_ids.split(',') : [] }));
    res.json({ items, total, page, pageSize });
  }));

  r.get('/shipments/:id', wrap((req, res) => {
    const sid = req.params.id;
    const shipment = get(db, 'SELECT * FROM shipment WHERE shipment_id = ?', sid);
    if (!shipment) throw notFound(`shipment ${sid} not found`);
    const run = get(db, 'SELECT * FROM compliance_run WHERE shipment_id = ? AND is_current = 1', sid) ?? null;
    const findings = run ? all(db, 'SELECT * FROM compliance_finding WHERE compliance_run_id = ? ORDER BY finding_id', run.compliance_run_id).map((f) => ({
      ...f, detail_json: f.detail_json ? JSON.parse(f.detail_json) : null,
      evidence_reading_ids: all(db, 'SELECT reading_id FROM compliance_evidence WHERE finding_id = ? ORDER BY reading_id LIMIT 50', f.finding_id).map((x) => x.reading_id),
      evidence_count: get(db, 'SELECT count(*) n FROM compliance_evidence WHERE finding_id = ?', f.finding_id).n })) : [];
    const exceptions = all(db, "SELECT * FROM excursion_report WHERE shipment_id = ? AND source = 'ENGINE' ORDER BY excursion_id", sid)
      .map((e) => ({ ...e, history: all(db, 'SELECT * FROM exception_event WHERE excursion_id = ? ORDER BY occurred_at, exception_event_id', e.excursion_id) }));
    res.json({
      shipment,
      product: get(db, 'SELECT * FROM product WHERE product_id = ?', shipment.product_id),
      lots: all(db, 'SELECT l.*, sl.quantity_units FROM shipment_lot sl JOIN lot l ON l.lot_id = sl.lot_id WHERE sl.shipment_id = ? ORDER BY l.lot_id', sid),
      packaging: all(db, 'SELECT p.*, sp.assigned_from, sp.assigned_to FROM shipment_packaging sp JOIN packaging p ON p.packaging_id = sp.packaging_id WHERE sp.shipment_id = ?', sid),
      applied_policy: get(db, 'SELECT * FROM threshold_policy WHERE policy_id = ?', shipment.policy_id) ?? null,
      policy_used: run ? get(db, 'SELECT * FROM threshold_policy WHERE policy_id = ?', run.policy_id) ?? null : null,
      logger_assignments: all(db, 'SELECT * FROM logger_assignment WHERE shipment_id = ? ORDER BY assigned_from', sid).map((a) => ({
        ...a, logger: get(db, 'SELECT * FROM logger WHERE logger_id = ?', a.logger_id) ?? null,
        calibrations: all(db, 'SELECT * FROM logger_calibration WHERE logger_id = ? ORDER BY calibrated_on', a.logger_id) })),
      status_history: all(db, 'SELECT * FROM shipment_status_history WHERE shipment_id = ? ORDER BY changed_at, history_id', sid),
      route_stops: all(db, 'SELECT * FROM route_stop WHERE shipment_id = ? ORDER BY COALESCE(stop_sequence, 1000000), actual_arrival', sid),
      custody_events: all(db, 'SELECT * FROM custody_event WHERE shipment_id = ? ORDER BY event_sequence', sid),
      compliance_run: run ? { ...run, is_current: run.is_current === 1 } : null,
      findings, exceptions,
      legacy_excursion_reports: all(db, "SELECT * FROM excursion_report WHERE shipment_id = ? AND source = 'LEGACY_IMPORT' ORDER BY excursion_id", sid),
      legacy_reports: all(db, 'SELECT * FROM legacy_report WHERE shipment_id = ?', sid),
    });
  }));

  r.get('/shipments/:id/readings', wrap((req, res) => {
    const sid = req.params.id;
    const s = get(db, 'SELECT * FROM shipment WHERE shipment_id = ?', sid);
    if (!s) throw notFound(`shipment ${sid} not found`);
    const run = get(db, 'SELECT * FROM compliance_run WHERE shipment_id = ? AND is_current = 1', sid);
    const policy = run ? get(db, 'SELECT * FROM threshold_policy WHERE policy_id = ?', run.policy_id) : get(db, 'SELECT * FROM threshold_policy WHERE policy_id = ?', s.policy_id);
    const readings = [], seen = new Set();
    for (const a of all(db, "SELECT * FROM logger_assignment WHERE shipment_id = ? AND assignment_status != 'CANCELLED'", sid)) {
      const from = s.departure_time && s.departure_time > a.assigned_from ? s.departure_time : a.assigned_from;
      const to = a.assigned_to && s.arrival_time && a.assigned_to < s.arrival_time ? a.assigned_to : (s.arrival_time ?? a.assigned_to);
      if (!to || from > to) continue;
      for (const x of all(db, "SELECT * FROM temperature_reading WHERE logger_id = ? AND recorded_at BETWEEN ? AND ? AND reading_quality = 'GOOD' ORDER BY recorded_at", a.logger_id, from, to)) {
        if (seen.has(x.reading_id)) continue;
        seen.add(x.reading_id);
        readings.push({ reading_id: x.reading_id, recorded_at: x.recorded_at, temperature_c: x.temperature_c, uncertainty_c: x.calibration_uncertainty_c,
          classification: policy ? classifyReading(x, policy) : null });
      }
    }
    readings.sort((a, b) => ms(a.recorded_at) - ms(b.recorded_at));
    const counts = { IN: 0, OUT: 0, MARGINAL: 0 };
    for (const x of readings) if (x.classification) counts[x.classification]++;
    const eng = all(db, "SELECT issue_type, start_time, end_time, duration_minutes, peak_temperature_c, severity FROM excursion_report WHERE shipment_id = ? AND source = 'ENGINE' AND start_time IS NOT NULL ORDER BY start_time", sid);
    res.json({
      shipment_id: sid, policy: policy ? { policy_id: policy.policy_id, min_temp_c: policy.min_temp_c, max_temp_c: policy.max_temp_c, max_excursion_minutes: policy.max_excursion_minutes, max_data_gap_minutes: policy.max_data_gap_minutes } : null,
      window: { from: s.departure_time, to: s.arrival_time }, counts, readings,
      excursion_periods: eng.filter((e) => e.issue_type === 'TEMP_HIGH' || e.issue_type === 'TEMP_LOW'),
      gap_periods: eng.filter((e) => e.issue_type === 'MISSING_DATA'),
    });
  }));

  r.get('/shipments/:id/report', wrap((req, res) => {
    const format = oneOf(req.query.format, ['json', 'md', 'html'], 'format') ?? 'json';
    const slice = loadSlice(db, req.params.id);
    if (!slice) throw notFound(`shipment ${req.params.id} not found`);
    if (slice.tables.shipment[0].shipment_status !== 'DELIVERED') throw badRequest('only DELIVERED shipments are evaluated and reported', 'NOT_EVALUATED');
    const cur = get(db, 'SELECT * FROM compliance_run WHERE shipment_id = ? AND is_current = 1', req.params.id);
    const asOf = cur ? cur.run_at : DEFAULT_AS_OF;
    const rep = buildReport(slice.tables, req.params.id, { asOf, readingStore: slice.readingStore, runId: cur ? cur.compliance_run_id : null });
    if (format === 'md') res.type('text/markdown; charset=utf-8').send(renderMarkdown(rep));
    else if (format === 'html') res.type('text/html; charset=utf-8').send(renderHtml(rep));
    else res.json(rep);
  }));

  r.get('/exceptions', wrap((req, res) => {
    const q = req.query;
    const { page, pageSize, offset } = paging(q);
    const where = [], p = [];
    const src = oneOf(q.source, ['ENGINE', 'LEGACY_IMPORT'], 'source') ?? 'ENGINE'; where.push('source = ?'); p.push(src);
    const st = oneOf(q.status, EXC_STATUS, 'status'); if (st) { where.push('status = ?'); p.push(st); }
    const sv = oneOf(q.severity, SEVERITY, 'severity'); if (sv) { where.push('severity = ?'); p.push(sv); }
    const it = oneOf(q.issueType, ISSUES, 'issueType'); if (it) { where.push('issue_type = ?'); p.push(it); }
    if (q.shipmentId !== undefined && q.shipmentId !== '') { where.push('shipment_id = ?'); p.push(String(q.shipmentId)); }
    const w = `WHERE ${where.join(' AND ')}`;
    const total = get(db, `SELECT count(*) n FROM excursion_report ${w}`, ...p).n;
    const items = all(db, `SELECT * FROM excursion_report ${w} ORDER BY excursion_id LIMIT ? OFFSET ?`, ...p, pageSize, offset);
    res.json({ items, total, page, pageSize });
  }));

  r.get('/exceptions/:id', wrap((req, res) => {
    const e = get(db, 'SELECT * FROM excursion_report WHERE excursion_id = ?', req.params.id);
    if (!e) throw notFound(`exception ${req.params.id} not found`);
    res.json({
      exception: e,
      history: all(db, 'SELECT * FROM exception_event WHERE excursion_id = ? ORDER BY occurred_at, exception_event_id', e.excursion_id),
      evidence_count: get(db, 'SELECT count(*) n FROM excursion_evidence WHERE excursion_id = ?', e.excursion_id).n,
      evidence_readings: all(db, 'SELECT t.reading_id, t.recorded_at, t.temperature_c, t.calibration_uncertainty_c, t.reading_quality FROM excursion_evidence x JOIN temperature_reading t ON t.reading_id = x.reading_id WHERE x.excursion_id = ? ORDER BY t.recorded_at LIMIT 200', e.excursion_id),
    });
  }));
  return r;
}
