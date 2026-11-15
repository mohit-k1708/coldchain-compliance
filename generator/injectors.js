// Anomaly injectors. Each mutates ONLY the given shipment's own rows and returns what it actually did;
// ground-truth labels are built from that return value, never from engine logic.
import * as ids from './ids.js';
import { iso, parse, MIN, HOUR, GRID } from './time.js';

export const INJECTOR_LABELS = ['BOUNDARY_AT_LIMIT', 'EXCURSION_WITHIN_ALLOWANCE', 'TEMPERATURE_EXCURSION',
  'CALIBRATION_MARGINAL', 'MISSING_DATA', 'MISSING_DATA_SILENTLY_PASSED', 'LOGGER_NOT_ASSIGNED',
  'CALIBRATION_EXPIRED', 'POLICY_MISMATCH', 'CUSTODY_GAP', 'CROSS_SHIPMENT_EXCURSION', 'ROUTE_DEVIATION'];

const TRUTH = {
  NONE: ['COMPLIANT', 'NONE', 'ALL_RULES_PASS'],
  BOUNDARY_AT_LIMIT: ['COMPLIANT', 'TEMPERATURE', 'ALL_RULES_PASS'],
  EXCURSION_WITHIN_ALLOWANCE: ['COMPLIANT', 'TEMPERATURE', 'ALL_RULES_PASS'],
  TEMPERATURE_EXCURSION: ['NON_COMPLIANT', 'TEMPERATURE', 'R-TEMP-03'],
  CALIBRATION_MARGINAL: ['INDETERMINATE', 'CALIBRATION', 'R-TEMP-04'],
  MISSING_DATA: ['INDETERMINATE', 'DATA_GAP', 'R-GAP-01'],
  MISSING_DATA_SILENTLY_PASSED: ['INDETERMINATE', 'DATA_GAP', 'R-GAP-01+R-SILENT-01'],
  LOGGER_NOT_ASSIGNED: ['INDETERMINATE', 'LOGGER', 'R-LOG-02'],
  CALIBRATION_EXPIRED: ['INDETERMINATE', 'CALIBRATION', 'R-LOG-03'],
  POLICY_MISMATCH: ['INDETERMINATE', 'POLICY', 'R-POL-01'],
  CUSTODY_GAP: ['INDETERMINATE', 'CUSTODY', 'R-CUS-01'],
  ROUTE_DEVIATION: ['NON_COMPLIANT', 'ROUTE', 'R-ROUTE-0X'],
  CROSS_SHIPMENT_EXCURSION: ['COMPLIANT', 'ISOLATION', 'R-ISO-01'],
};
const ROUTE_RULE = { MISSING_STOP: 'R-ROUTE-01', UNEXPECTED_STOP: 'R-ROUTE-02', SEQUENCE: 'R-ROUTE-03', EXCESS_DWELL: 'R-ROUTE-04' };

export function makeTruth(shipmentId, label, r = {}) {
  const [decision, category, rule] = TRUTH[label];
  return {
    shipment_id: shipmentId, issue_type: label, variant: r.variant ?? '', expected_decision: decision,
    expected_evidence_category: category, expected_rule: r.rule ?? rule,
    expected_excursion_minutes: r.expected_excursion_minutes ?? '', expected_gap_minutes: r.expected_gap_minutes ?? '',
    related_shipment_id: r.related_shipment_id ?? '',
  };
}

const r2 = (x) => Math.round(x * 100) / 100;
// Severity per docs/BUSINESS-RULES.md section 5.
const severity = (dev, minutes, A) => (dev >= 5 || minutes >= 4 * A ? 'CRITICAL'
  : minutes > A ? 'HIGH' : minutes > 0.5 * A ? 'MEDIUM' : 'LOW');

function view(b) {
  const rs = b.rows.temperature_reading;
  const P = b.info.policy;
  return { rs, P, u: rs[0].calibration_uncertainty_c, A: P.max_excursion_minutes, min: P.min_temp_c, max: P.max_temp_c,
    kmax: Math.floor(P.max_excursion_minutes / 10) };
}

function addReport(b, { issue, startMs, endMs, minutes, peak, dev, evidence }) {
  const { rows, info } = b;
  const id = ids.excursionId((info.n - 1) * 10 + rows.excursion_report.length + 1);
  rows.excursion_report.push({
    excursion_id: id, shipment_id: info.shipment_id, logger_id: info.logger.logger_id,
    logger_assignment_id: info.assignmentId, policy_id: info.policy.policy_id, compliance_run_id: null,
    source: 'LEGACY_IMPORT', issue_type: issue, start_time: iso(startMs), end_time: iso(endMs),
    duration_minutes: minutes, peak_temperature_c: peak, severity: severity(dev, minutes, info.policy.max_excursion_minutes),
    status: 'OPEN', detected_at: iso(endMs + HOUR), assigned_analyst: null, resolution: null, resolved_at: null,
    evidence_reference: null,
  });
  for (const rid of evidence) rows.excursion_evidence.push({ excursion_id: id, reading_id: rid });
}

// Writes values into rs[s..s+k) and records the matching legacy report. Returns the run's peak.
function applyRun(b, s, k, vals, high) {
  const { rs, P } = view(b);
  vals.forEach((v, i) => { rs[s + i].temperature_c = r2(v); });
  const temps = vals.map(r2);
  const peak = high ? Math.max(...temps) : Math.min(...temps);
  const dev = Math.abs(peak - (high ? P.max_temp_c : P.min_temp_c));
  addReport(b, { issue: high ? 'TEMP_HIGH' : 'TEMP_LOW', startMs: parse(rs[s].recorded_at),
    endMs: parse(rs[s + k].recorded_at), minutes: k * 10, peak, dev,
    evidence: rs.slice(s, s + k).map((r) => r.reading_id) });
}

function bigRunVals(rng, k, limit, high, u, peakDev) {
  const c = (k - 1) / 2;
  const dev = Array.from({ length: k }, (_, i) => Math.max(u + 0.5, peakDev * (1 - 0.6 * Math.abs(i - c) / Math.max(c, 0.5))));
  dev[Math.floor(k / 2)] = peakDev;
  return dev.map((d) => (high ? limit + d : limit - d));
}

function deleteBlock(b, rng) {
  const { rs } = view(b);
  const k = rng.int(4, 12);
  const s = rng.int(1, rs.length - k - 2); // interior only: never first or last reading
  rs.splice(s, k);
  return (k + 1) * 10;
}

const INJECT = {
  BOUNDARY_AT_LIMIT(b, rng) {
    const { rs, u, min, max } = view(b);
    const high = rng.chance(0.5), k = rng.int(3, 6), s = rng.int(2, rs.length - k - 2);
    for (let i = 0; i < k; i++) rs[s + i].temperature_c = r2(high ? max - u : min + u);
    return { variant: high ? 'HIGH' : 'LOW' };
  },
  EXCURSION_WITHIN_ALLOWANCE(b, rng) {
    const { rs, u, min, max, kmax } = view(b);
    const high = rng.chance(0.5), k = rng.int(1, kmax), s = rng.int(2, rs.length - k - 2);
    const vals = Array.from({ length: k }, () => (high ? max + u + 0.3 + rng.int(1, 8) / 10 : min - u - 0.3 - rng.int(1, 8) / 10));
    applyRun(b, s, k, vals, high);
    return { variant: high ? 'HIGH' : 'LOW', expected_excursion_minutes: k * 10 };
  },
  TEMPERATURE_EXCURSION(b, rng) {
    const { rs, u, min, max, kmax } = view(b);
    const high = rng.chance(0.5), limit = high ? max : min;
    const two = rng.chance(0.4) && kmax >= 2;
    const runs = [];
    if (!two) {
      const k = kmax + rng.int(1, 3);
      runs.push([rng.int(2, rs.length - k - 2), k]);
    } else {
      const k1 = rng.int(1, kmax), k2 = rng.int(Math.max(1, kmax - k1 + 1), kmax), mid = Math.floor(rs.length / 2);
      runs.push([rng.int(2, mid - k1 - 3), k1], [rng.int(mid + 2, rs.length - k2 - 2), k2]);
    }
    let total = 0;
    for (const [s, k] of runs) {
      applyRun(b, s, k, bigRunVals(rng, k, limit, high, u, rng.int(20, 70) / 10), high);
      total += k * 10;
    }
    b.rows.legacy_report[0].reported_status = 'FAIL';
    return { variant: two ? 'TWO_RUNS' : 'SINGLE_RUN', expected_excursion_minutes: total };
  },
  CALIBRATION_MARGINAL(b, rng) {
    const { rs, u, min, max, kmax } = view(b);
    const high = rng.chance(0.5), k = kmax + 1, s = rng.int(2, rs.length - k - 2);
    for (let i = 0; i < k; i++) {
      const d = r2(u * rng.int(30, 70) / 100); // strictly inside (0, u)
      rs[s + i].temperature_c = r2(high ? max - d : min + d);
    }
    return { variant: high ? 'HIGH' : 'LOW' };
  },
  MISSING_DATA(b, rng) {
    const gap = deleteBlock(b, rng);
    b.rows.legacy_report.length = 0; // no legacy report at all
    return { expected_gap_minutes: gap };
  },
  MISSING_DATA_SILENTLY_PASSED(b, rng) {
    return { expected_gap_minutes: deleteBlock(b, rng) }; // legacy report stays PASS
  },
  LOGGER_NOT_ASSIGNED(b, rng) {
    const { rs } = view(b);
    if (rng.chance(0.5)) {
      b.rows.logger_assignment.length = 0;
      for (const r of rs) r.logger_assignment_id = null;
      return { variant: 'DELETED' };
    }
    b.rows.logger_assignment[0].assigned_to = iso(b.info.A - rng.int(24, 60) * GRID);
    return { variant: 'WINDOW_TRUNCATED' };
  },
  CALIBRATION_EXPIRED() { return {}; }, // the lapsed logger is chosen at baseline time
  POLICY_MISMATCH(b, rng, master) {
    const { info, rows } = b;
    if (rng.chance(0.5)) {
      const other = rng.pick(master.product.filter((p) => p.product_id !== info.product.product_id));
      rows.shipment[0].policy_id = master.threshold_policy.find((p) => p.product_id === other.product_id
        && parse(p.effective_from) <= info.D && (p.effective_to === null || parse(p.effective_to) > info.D)).policy_id;
      return { variant: 'WRONG_PRODUCT' };
    }
    rows.shipment[0].policy_id = master.threshold_policy.find((p) => p.product_id === info.product.product_id
      && p.policy_id !== info.policy.policy_id).policy_id;
    return { variant: 'WRONG_VERSION' };
  },
  CUSTODY_GAP(b, rng) {
    const ev = b.rows.custody_event;
    const variant = rng.pick(['MISSING_HANDOVER', 'MISSING_PICKUP', 'MISSING_DELIVERY', 'NULL_RECEIVING_PARTY']);
    if (variant === 'MISSING_HANDOVER') {
      const hs = ev.filter((e) => e.event_type === 'HANDOVER');
      ev.splice(ev.indexOf(rng.pick(hs)), 1);
    } else if (variant === 'MISSING_PICKUP') ev.splice(0, 1);
    else if (variant === 'MISSING_DELIVERY') ev.splice(ev.length - 1, 1);
    else rng.pick(ev).to_party_id = null;
    return { variant };
  },
  ROUTE_DEVIATION(b, rng, master) {
    const { rows, info } = b;
    const stops = rows.route_stop; // index 0 origin, 1..m transit, m+1 destination
    const maxDwell = info.policy.max_dwell_minutes;
    const transit = Array.from({ length: info.m }, (_, i) => i + 1);
    const options = ['MISSING_STOP', 'UNEXPECTED_STOP', 'EXCESS_DWELL', ...(info.m >= 2 ? ['SEQUENCE'] : [])];
    const variant = rng.pick(options);
    if (variant === 'MISSING_STOP') {
      const st = stops[rng.pick(transit)];
      st.actual_arrival = st.actual_departure = st.actual_sequence = null;
    } else if (variant === 'UNEXPECTED_STOP') {
      const j = rng.int(0, info.m); // inserted after stop j
      const used = new Set(stops.map((s) => s.location));
      const loc = rng.pick(['Chicago', 'Dallas', 'Atlanta', 'Denver', 'Seattle', 'Boston', 'Phoenix', 'Memphis',
        'Columbus', 'Omaha', 'Reno', 'Tampa'].filter((c) => !used.has(c)));
      const aa = parse(stops[j].actual_departure) + 30 * MIN;
      for (const s of stops) if (s.actual_sequence >= j + 2) s.actual_sequence += 1;
      stops.push({ route_stop_id: ids.routeStopId((info.n - 1) * 10 + stops.length + 1), shipment_id: info.shipment_id,
        location: loc, stop_type: 'TRANSIT', stop_sequence: null, actual_sequence: j + 2, planned_arrival: null,
        planned_departure: null, actual_arrival: iso(aa), actual_departure: iso(aa + rng.int(20, 60) * MIN) });
    } else if (variant === 'SEQUENCE') {
      const [a, c] = [stops[1], stops[2]];
      [a.actual_sequence, c.actual_sequence] = [c.actual_sequence, a.actual_sequence];
    } else {
      const st = stops[rng.pick(transit)];
      const idx = stops.indexOf(st);
      const target = (maxDwell + rng.int(30, 90)) * MIN;
      const aa = parse(st.actual_arrival), ad = parse(st.actual_departure);
      const delta = target - (ad - aa);
      const slackAfter = parse(stops[idx + 1].actual_arrival) - ad - 10 * MIN;
      const later = Math.min(delta, Math.max(0, slackAfter)); // extend departure first
      const earlier = delta - later; // remainder: arrive earlier
      st.actual_departure = iso(ad + later);
      st.actual_arrival = iso(aa - earlier);
      if (parse(st.actual_arrival) <= parse(stops[idx - 1].actual_departure)) throw new Error('EXCESS_DWELL infeasible');
    }
    return { variant, rule: ROUTE_RULE[variant] };
  },
};

export function applyInjector(label, built, rng, master) {
  if (label === 'NONE') return makeTruth(built.info.shipment_id, 'NONE');
  return makeTruth(built.info.shipment_id, label, INJECT[label](built, rng, master));
}

// Pair A then B on the SAME logger. B was built departing exactly arrival_A + 10 min with A's product.
export function applyCrossPair(a, b, rng) {
  const va = view(a), vb = view(b);
  const { u, min, max, kmax } = va;
  const high = rng.chance(0.5);
  const kA = rng.int(2, kmax);
  const kB = rng.int(Math.max(2, kmax + 2 - kA), kmax); // own runs <= allowance; merged span > allowance
  const out = (i) => r2(high ? max + u + 0.5 + rng.int(0, 40) / 10 : min - u - 0.5 - rng.int(0, 40) / 10);
  const tail = va.rs.slice(va.rs.length - kA), head = vb.rs.slice(0, kB);
  for (const r of [...tail, ...head]) r.temperature_c = out();
  // windows must not overlap yet each still covers its own [departure, arrival]
  a.rows.logger_assignment[0].assigned_to = iso(a.info.A);
  b.rows.logger_assignment[0].assigned_from = iso(b.info.D);
  const all = [...tail, ...head];
  const peak = high ? Math.max(...all.map((r) => r.temperature_c)) : Math.min(...all.map((r) => r.temperature_c));
  const startMs = parse(tail[0].recorded_at);
  const endMs = parse(vb.rs[kB].recorded_at); // first in-range reading, inside B's window
  addReport(a, { issue: 'CROSS_SHIPMENT_REPORT', startMs, endMs, minutes: (kA + kB) * 10, peak,
    dev: Math.abs(peak - (high ? max : min)), evidence: all.map((r) => r.reading_id) });
  a.rows.legacy_report[0].reported_status = 'FAIL'; // legacy system wrongly failed A
  return [
    makeTruth(a.info.shipment_id, 'CROSS_SHIPMENT_EXCURSION', { variant: 'FIRST', related_shipment_id: b.info.shipment_id }),
    makeTruth(b.info.shipment_id, 'CROSS_SHIPMENT_EXCURSION', { variant: 'SECOND', related_shipment_id: a.info.shipment_id }),
  ];
}
