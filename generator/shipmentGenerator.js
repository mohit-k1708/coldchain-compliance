import * as ids from './ids.js';
import { iso, parse, MIN, DAY, HOUR, GRID } from './time.js';
import { generateReadings } from './readingGenerator.js';

const CITIES = ['Chicago', 'Dallas', 'Atlanta', 'Denver', 'Seattle', 'Boston', 'Phoenix', 'Memphis', 'Columbus', 'Omaha', 'Reno', 'Tampa'];
const DEP_START = parse('2026-01-15T00:00:00Z');
const DEP_END = parse('2026-10-31T23:40:00Z');

function pickDistinct(rng, arr, k) {
  const pool = [...arr];
  const out = [];
  for (let i = 0; i < k; i++) out.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
  return out;
}

// ctx: { rng, master, scheduler, id(kind) }
export function buildNormalShipment(ctx, n) {
  const { rng, master, scheduler } = ctx;
  const product = rng.pick(master.product);
  const pkg = master.packaging.find((p) => p.min_supported_temp_c <= product.required_min_temp_c
    && p.max_supported_temp_c >= product.required_max_temp_c && p.packaging_status === 'ACTIVE');
  const maxSlots = Math.floor(Math.min(72 * 60, pkg.qualified_duration_hours * 60) / 10);

  let logger = null, P0, Pn, D, A, delay0;
  for (let attempt = 0; attempt < 500 && !logger; attempt++) {
    P0 = DEP_START + rng.int(0, Math.floor((DEP_END - DEP_START) / GRID)) * GRID;
    const dur = GRID * rng.int(72, maxSlots); // 12h .. min(72h, packaging qualification)
    delay0 = rng.int(0, 1) * GRID;
    Pn = P0 + dur;
    D = P0 + delay0;
    A = D + dur;
    logger = scheduler.allocate(D, A);
  }
  if (!logger) throw new Error('no logger available for shipment ' + n);

  const policy = master.threshold_policy.find((p) => p.product_id === product.product_id
    && p.policy_status === 'ACTIVE' && parse(p.effective_from) <= D
    && (p.effective_to === null || parse(p.effective_to) > D));
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

  const logger_assignment_id = ids.assignmentId(shipment_id, 1);
  const logger_assignment = [{ logger_assignment_id, logger_id: logger.logger_id, shipment_id,
    assigned_from: iso(D - 30 * MIN), assigned_to: iso(A + 30 * MIN), assignment_status: 'COMPLETED' }];

  const temperature_reading = generateReadings(rng, { logger, assignmentId: logger_assignment_id,
    departureMs: D, arrivalMs: A, policy });

  // Route stops: [type, location, planned_arr, planned_dep, actual_arr, actual_dep]
  const raw = [['ORIGIN', cities[0], P0 - 30 * MIN, P0, null, D]];
  raw[0][4] = raw[0][2] + rng.int(0, 15) * MIN;
  for (let i = 1; i <= m; i++) {
    const pa = P0 + Math.round((T * i) / (m + 1) / MIN) * MIN;
    const pd = pa + rng.int(20, 90) * MIN;
    raw.push(['TRANSIT', cities[i], pa, pd, pa + rng.int(0, 15) * MIN, pd + rng.int(0, 15) * MIN]);
  }
  raw.push(['DESTINATION', cities[m + 1], Pn, null, A, null]);
  const route_stop = raw.map(([stop_type, location, pa, pd, aa, ad], i) => ({
    route_stop_id: ids.routeStopId(ctx.id('routeStop')), shipment_id, location, stop_type, stop_sequence: i + 1, actual_sequence: i + 1,
    planned_arrival: iso(pa), planned_departure: pd === null ? null : iso(pd),
    actual_arrival: iso(aa), actual_departure: ad === null ? null : iso(ad),
  }));

  // Custody chain: origin -> carrier[0] (PICKUP) -> carrier[i] at each transit stop (HANDOVER) -> destination (DELIVERY)
  const ev = [['PICKUP', originParty.party_id, carriers[0].party_id, D, cities[0]]];
  for (let i = 1; i <= m; i++) ev.push(['HANDOVER', carriers[i - 1].party_id, carriers[i].party_id, raw[i][4], cities[i]]);
  ev.push(['DELIVERY', carriers[m].party_id, dest.party_id, A, cities[m + 1]]);
  const custody_event = ev.map(([event_type, from, to, ts, location], i) => ({
    custody_event_id: ids.custodyId(ctx.id('custody')), shipment_id, event_sequence: i + 1, from_party_id: from, to_party_id: to,
    event_type, event_timestamp: iso(ts), recorded_at: iso(ts + rng.int(0, 30) * MIN), location,
  }));

  const hist = [[null, 'PLANNED', P0 - 7 * DAY], ['PLANNED', 'PACKED', D - 2 * HOUR],
    ['PACKED', 'IN_TRANSIT', D], ['IN_TRANSIT', 'DELIVERED', A]];
  const shipment_status_history = hist.map(([from_status, to_status, at]) => ({
    history_id: ids.historyId(ctx.id('history')), shipment_id, from_status, to_status, changed_at: iso(at), changed_by: 'system',
  }));

  const legacy_report = [{ legacy_report_id: ids.legacyReportId(ctx.id('legacy')), shipment_id, reported_status: 'PASS',
    reported_by: 'legacy-system', reported_at: iso(A + 2 * HOUR) }];

  return { shipment, shipment_lot, shipment_packaging, logger_assignment, temperature_reading,
    route_stop, custody_event, shipment_status_history, legacy_report };
}
