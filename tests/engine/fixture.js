// Hand-built dataset fixtures for engine unit tests (independent of the generator's data).
import * as ids from '../../generator/ids.js';

export const BASE = Date.parse('2026-03-10T10:00:00Z');
export const at = (min) => new Date(BASE + min * 60000).toISOString().replace('.000Z', 'Z');
export const AS_OF = '2026-11-01T00:00:00Z';

const P = { origin: 'PTY-000001', carrier: 'PTY-000002', dest: 'PTY-000003', other: 'PTY-000004' };

// spec: { policy:{min,max,allowance,gap,dwell,sampling}, u, shipments:[{ n, dep, arr, readings:[[min,temp,quality?]],
//   assign:{from,to}|false, policyId, custody:[[seq,type,from,to,min]], stops, legacy:'PASS'|'FAIL'|null, legacyExc:[{start,end,minutes}],
//   calib:{on,expires}, lots:boolean }], extraAssignments:[] }
export function build(spec = {}) {
  const pol = { min: 2, max: 8, allowance: 30, gap: 20, dwell: 120, sampling: 10, ...(spec.policy ?? {}) };
  const u = spec.u ?? 0;
  const ds = {
    party: [], product: [
      { product_id: 'PRD-000001', product_name: 'P1', category: 'VACCINE', supplier_party_id: P.origin, required_min_temp_c: pol.min, required_max_temp_c: pol.max, max_excursion_minutes: pol.allowance, created_at: '2026-01-01T00:00:00Z' },
      { product_id: 'PRD-000002', product_name: 'P2', category: 'OTHER', supplier_party_id: P.origin, required_min_temp_c: 15, required_max_temp_c: 25, max_excursion_minutes: 60, created_at: '2026-01-01T00:00:00Z' }],
    lot: [{ lot_id: 'LOT-2026-000001', product_id: 'PRD-000001', manufacturing_date: '2025-09-01', expiry_date: '2027-03-01', lot_status: 'RELEASED', created_at: '2025-12-01T00:00:00Z' }],
    packaging: [{ packaging_id: 'PKG-000001', packaging_type: 'box', min_supported_temp_c: 0, max_supported_temp_c: 10, qualified_duration_hours: 96, packaging_status: 'ACTIVE' }],
    logger: [{ logger_id: 'LGR-000001', device_serial_number: 'SN1', calibration_status: 'VALID', calibration_date: '2026-01-01', calibration_expiry: '2027-01-01', calibration_uncertainty_c: u, device_status: 'AVAILABLE' }],
    logger_calibration: [], threshold_policy: [
      { policy_id: 'POL-000001', product_id: 'PRD-000001', policy_version: 1, min_temp_c: pol.min, max_temp_c: pol.max, max_excursion_minutes: pol.allowance, max_data_gap_minutes: pol.gap, sampling_interval_minutes: pol.sampling, max_dwell_minutes: pol.dwell, effective_from: '2026-01-01T00:00:00Z', effective_to: null, policy_status: 'ACTIVE' },
      { policy_id: 'POL-000002', product_id: 'PRD-000002', policy_version: 1, min_temp_c: 15, max_temp_c: 25, max_excursion_minutes: 60, max_data_gap_minutes: pol.gap, sampling_interval_minutes: pol.sampling, max_dwell_minutes: pol.dwell, effective_from: '2026-01-01T00:00:00Z', effective_to: null, policy_status: 'ACTIVE' }],
    shipment: [], shipment_status_history: [], shipment_lot: [], shipment_packaging: [], logger_assignment: [], temperature_reading: [],
    custody_event: [], route_stop: [], compliance_run: [], compliance_finding: [], compliance_evidence: [], excursion_report: [],
    excursion_evidence: [], exception_event: [], legacy_report: [],
  };
  const calibs = new Set();
  for (const s of spec.shipments) {
    const sid = ids.shipmentId(s.n), aid = ids.assignmentId(sid, 1), logger = s.logger ?? 'LGR-000001';
    const cal = s.calib ?? { on: '2026-01-01', expires: '2027-01-01' };
    if (!calibs.has(logger)) { calibs.add(logger); ds.logger_calibration.push({ calibration_id: `CAL-00000${calibs.size}`, logger_id: logger, calibrated_on: cal.on, expires_on: cal.expires, uncertainty_c: u }); }
    ds.shipment.push({ shipment_id: sid, product_id: 'PRD-000001', policy_id: s.policyId ?? 'POL-000001', origin_location: 'A', destination_location: 'B',
      origin_party_id: P.origin, destination_party_id: P.dest, planned_departure: at(s.dep), planned_arrival: at(s.arr), departure_time: at(s.dep),
      arrival_time: at(s.arr), shipment_status: s.status ?? 'DELIVERED', created_at: '2026-01-01T00:00:00Z' });
    if (s.lots !== false) ds.shipment_lot.push({ shipment_id: sid, lot_id: 'LOT-2026-000001', quantity_units: 10 });
    ds.shipment_packaging.push({ shipment_id: sid, packaging_id: 'PKG-000001', assigned_from: at(s.dep - 30), assigned_to: at(s.arr + 30) });
    const asg = s.assign === false ? null : (s.assign ?? { from: s.dep - 30, to: s.arr + 30 });
    if (asg) ds.logger_assignment.push({ logger_assignment_id: aid, logger_id: logger, shipment_id: sid, assigned_from: at(asg.from), assigned_to: asg.to === null ? null : at(asg.to), assignment_status: 'COMPLETED' });
    for (const [m, temp, q] of s.readings) {
      ds.temperature_reading.push({ reading_id: ids.readingId(logger, BASE + m * 60000), logger_id: logger, logger_assignment_id: asg ? aid : null,
        recorded_at: at(m), received_at: at(m + 1), temperature_c: temp, calibration_uncertainty_c: u, reading_quality: q ?? 'GOOD' });
    }
    const ev = s.custody ?? [[1, 'PICKUP', P.origin, P.carrier, s.dep], [2, 'DELIVERY', P.carrier, P.dest, s.arr]];
    ev.forEach(([seq, type, from, to, m], i) => ds.custody_event.push({ custody_event_id: `CUS-2026-${s.n}${i}`.padEnd(15, '0').slice(0, 15), shipment_id: sid,
      event_sequence: seq, from_party_id: from, to_party_id: to, event_type: type, event_timestamp: at(m), recorded_at: at(m + 5), location: 'X' }));
    const stops = s.stops ?? [['ORIGIN', s.dep - 30, s.dep, s.dep - 30, s.dep, 1, 1], ['DESTINATION', s.arr, null, s.arr, null, 2, 2]];
    stops.forEach(([type, pa, pd, aa, ad, seq, aseq], i) => ds.route_stop.push({ route_stop_id: `RST-2026-${s.n}${i}`, shipment_id: sid, location: `L${i}`, stop_type: type,
      stop_sequence: seq, actual_sequence: aseq, planned_arrival: pa === null ? null : at(pa), planned_departure: pd === null ? null : at(pd),
      actual_arrival: aa === null ? null : at(aa), actual_departure: ad === null ? null : at(ad) }));
    if (s.legacy) ds.legacy_report.push({ legacy_report_id: ids.legacyReportId(s.n), shipment_id: sid, reported_status: s.legacy, reported_by: 'legacy', reported_at: at(s.arr + 60) });
    (s.legacyExc ?? []).forEach((x, i) => ds.excursion_report.push({ excursion_id: ids.excursionId(s.n * 10 + i), shipment_id: sid, logger_id: logger, logger_assignment_id: aid,
      policy_id: 'POL-000001', compliance_run_id: null, source: 'LEGACY_IMPORT', issue_type: x.issue ?? 'TEMP_HIGH', start_time: at(x.start), end_time: at(x.end),
      duration_minutes: x.minutes ?? x.end - x.start, peak_temperature_c: 9, severity: 'LOW', status: 'OPEN', detected_at: at(x.end + 60) }));
  }
  for (const a of spec.extraAssignments ?? []) ds.logger_assignment.push({ assignment_status: 'COMPLETED', logger_id: 'LGR-000001', ...a,
    assigned_from: at(a.from), assigned_to: at(a.to) });
  return ds;
}

export const every10 = (from, to, temps) => {
  const out = [];
  for (let m = from, i = 0; m <= to; m += 10, i++) out.push([m, typeof temps === 'function' ? temps(i, m) : temps[i]]);
  return out;
};

// summarize one shipment's result from evaluateAll output
export function pick(out, n) {
  const sid = ids.shipmentId(n);
  const run = out.runs.find((r) => r.shipment_id === sid);
  const findings = out.findings.filter((f) => f.compliance_run_id === run.compliance_run_id);
  const by = (code) => findings.filter((f) => f.rule_code === code);
  return { run, status: run.compliance_status, findings, by, one: (code) => by(code)[0], json: (code) => JSON.parse(by(code)[0].detail_json) };
}
