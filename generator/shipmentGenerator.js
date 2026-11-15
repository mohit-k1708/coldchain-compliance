import * as ids from './ids.js';
import { iso, parse, MIN, DAY, HOUR, GRID } from './time.js';
import { generateReadings } from './readingGenerator.js';

const CITIES = ['Chicago', 'Dallas', 'Atlanta', 'Denver', 'Seattle', 'Boston', 'Phoenix', 'Memphis', 'Columbus', 'Omaha', 'Reno', 'Tampa'];
export const DEP_START = parse('2026-01-15T00:00:00Z');
export const DEP_END = parse('2026-10-31T23:40:00Z');
export const SPAN_UNITS = Math.floor((DEP_END - DEP_START) / GRID);

function pickDistinct(rng, arr, k) {
  const pool = [...arr];
  const out = [];
  for (let i = 0; i < k; i++) out.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
  return out;
}

// Right-skewed arrival delay in 10-minute units: mostly 0-60 min, rare up to 240 min.
function skewedUnits(rng) {
  if (rng.next() < 0.03) return rng.int(7, 24);
  return Math.min(6, Math.floor(-Math.log(1 - rng.next()) * 2));
}

export function effectivePolicy(master, productId, ms) {
  return master.threshold_policy.find((p) => p.product_id === productId && parse(p.effective_from) <= ms
    && (p.effective_to === null || parse(p.effective_to) > ms));
}

// Builds a valid NORMAL shipment. rng must be the shipment's own stream; every child ID derives from n.
// opts: { logger, P0 (grid ms), product?, fixedDeparture? (departure exactly P0, no delay) }
export function buildBaseline({ rng, master, n, logger, P0, product: forced, fixedDeparture = false }) {
  const picked = rng.pick(master.product);
  const product = forced ?? picked;
  const pkg = master.packaging.find((p) => p.min_supported_temp_c <= product.required_min_temp_c
    && p.max_supported_temp_c >= product.required_max_temp_c && p.packaging_status === 'ACTIVE');
  const maxSlots = Math.floor(Math.min(72 * 60, pkg.qualified_duration_hours * 60) / 10);
  const dur = GRID * rng.int(72, maxSlots); // planned duration 12h .. min(72h, packaging qualification)
  const d0 = GRID * rng.int(0, 1);
  const delay0 = fixedDeparture ? 0 : d0;
  const arrDelay = Math.max(GRID * skewedUnits(rng), delay0);
  const Pn = P0 + dur;
  const D = P0 + delay0;
  const A = Pn + arrDelay;

  const policy = effectivePolicy(master, product.product_id, D);
  const maxDwell = policy.max_dwell_minutes;
  const shipment_id = ids.shipmentId(n);
  const T = Pn - P0;
  const m = rng.int(1, 2); // transit stops
  const cities = pickDistinct(rng, CITIES, m + 2);
  const carriers = pickDistinct(rng, master.party.filter((p) => p.party_type === 'CARRIER'), m + 1);
  const dest = rng.pick(master.party.filter((p) => p.party_type === 'WAREHOUSE'));
  const originParty = master.party.find((p) => p.party_id === product.supplier_party_id);

  const shipment = [{
    shipment_id, product_id: product.product_id, policy_id: policy.policy_id,
    origin_location: cities[0], destination_location: cities[m + 1],
    origin_party_id: originParty.party_id, destination_party_id: dest.party_id,
    planned_departure: iso(P0), planned_arrival: iso(Pn), departure_time: iso(D), arrival_time: iso(A),
    shipment_status: 'DELIVERED', created_at: iso(P0 - 7 * DAY),
  }];

  const lots = master.lot.filter((l) => l.product_id === product.product_id);
  const chosen = rng.int(1, 2) === 2 ? lots : [rng.pick(lots)];
  const shipment_lot = chosen.map((l) => ({ shipment_id, lot_id: l.lot_id, quantity_units: rng.int(100, 1000) }));
  const shipment_packaging = [{ shipment_id, packaging_id: pkg.packaging_id,
    assigned_from: iso(D - 45 * MIN), assigned_to: iso(A + 30 * MIN) }];

  const assignmentId = ids.assignmentId(shipment_id, 1);
  const logger_assignment = [{ logger_assignment_id: assignmentId, logger_id: logger.logger_id, shipment_id,
    assigned_from: iso(D - 30 * MIN), assigned_to: iso(A + 30 * MIN), assignment_status: 'COMPLETED' }];
  const temperature_reading = generateReadings(rng, { logger, assignmentId, departureMs: D, arrivalMs: A, policy });

  // Route stops: [type, location, planned_arr, planned_dep, actual_arr, actual_dep]
  const raw = [['ORIGIN', cities[0], P0 - 30 * MIN, P0, null, D]];
  raw[0][4] = raw[0][2] + rng.int(0, 15) * MIN;
  for (let i = 1; i <= m; i++) {
    const pa = P0 + Math.round((T * i) / (m + 1) / MIN) * MIN;
    const pd = pa + rng.int(20, maxDwell - 15) * MIN; // actual dwell <= planned + 15 <= maxDwell
    raw.push(['TRANSIT', cities[i], pa, pd, pa + rng.int(0, 15) * MIN, pd + rng.int(0, 15) * MIN]);
  }
  raw.push(['DESTINATION', cities[m + 1], Pn, null, A, null]);
  const route_stop = raw.map(([stop_type, location, pa, pd, aa, ad], i) => ({
    route_stop_id: ids.routeStopId((n - 1) * 10 + i + 1), shipment_id, location, stop_type,
    stop_sequence: i + 1, actual_sequence: i + 1,
    planned_arrival: iso(pa), planned_departure: pd === null ? null : iso(pd),
    actual_arrival: iso(aa), actual_departure: ad === null ? null : iso(ad),
  }));

  // Custody: origin -> carrier[0] (PICKUP) -> carrier[i] at each transit stop (HANDOVER) -> destination (DELIVERY)
  const ev = [['PICKUP', originParty.party_id, carriers[0].party_id, D, cities[0]]];
  for (let i = 1; i <= m; i++) ev.push(['HANDOVER', carriers[i - 1].party_id, carriers[i].party_id, raw[i][4], cities[i]]);
  ev.push(['DELIVERY', carriers[m].party_id, dest.party_id, A, cities[m + 1]]);
  const custody_event = ev.map(([event_type, from, to, ts, location], i) => ({
    custody_event_id: ids.custodyId((n - 1) * 10 + i + 1), shipment_id, event_sequence: i + 1,
    from_party_id: from, to_party_id: to, event_type, event_timestamp: iso(ts),
    recorded_at: iso(ts + rng.int(0, 30) * MIN), location,
  }));

  const hist = [[null, 'PLANNED', P0 - 7 * DAY], ['PLANNED', 'PACKED', D - 2 * HOUR],
    ['PACKED', 'IN_TRANSIT', D], ['IN_TRANSIT', 'DELIVERED', A]];
  const shipment_status_history = hist.map(([from_status, to_status, at], i) => ({
    history_id: ids.historyId((n - 1) * 10 + i + 1), shipment_id, from_status, to_status,
    changed_at: iso(at), changed_by: 'system',
  }));
  const legacy_report = [{ legacy_report_id: ids.legacyReportId(n), shipment_id, reported_status: 'PASS',
    reported_by: 'legacy-system', reported_at: iso(A + 2 * HOUR) }];

  return {
    rows: { shipment, shipment_lot, shipment_packaging, logger_assignment, temperature_reading, route_stop,
      custody_event, shipment_status_history, legacy_report, excursion_report: [], excursion_evidence: [] },
    info: { n, shipment_id, product, policy, logger, P0, Pn, D, A, assignmentId, m, cities },
  };
}
