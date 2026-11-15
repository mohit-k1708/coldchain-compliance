import { ms } from './time.js';

function group(rows, key) {
  const m = new Map();
  for (const r of rows) {
    const k = r[key];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}

// First index with ts[i] >= x
function lowerBound(arr, x) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid].t < x) lo = mid + 1; else hi = mid; }
  return lo;
}
// First index with ts[i] > x
function upperBound(arr, x) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid].t <= x) lo = mid + 1; else hi = mid; }
  return lo;
}

export function buildIndexes(ds, { readingStore = null } = {}) {
  const rows = (t) => ds[t] ?? [];
  const readingsByLogger = new Map();
  for (const r of rows('temperature_reading')) {
    if (!readingsByLogger.has(r.logger_id)) readingsByLogger.set(r.logger_id, []);
    readingsByLogger.get(r.logger_id).push({ t: ms(r.recorded_at), row: r });
  }
  for (const arr of readingsByLogger.values()) arr.sort((a, b) => a.t - b.t);

  const packagingById = new Map(rows('packaging').map((p) => [p.packaging_id, p]));
  return {
    shipments: rows('shipment'),
    productById: new Map(rows('product').map((p) => [p.product_id, p])),
    lotById: new Map(rows('lot').map((l) => [l.lot_id, l])),
    loggerById: new Map(rows('logger').map((l) => [l.logger_id, l])),
    policyById: new Map(rows('threshold_policy').map((p) => [p.policy_id, p])),
    policiesByProduct: group(rows('threshold_policy'), 'product_id'),
    lotsByShipment: group(rows('shipment_lot'), 'shipment_id'),
    stopsByShipment: group(rows('route_stop'), 'shipment_id'),
    custodyByShipment: group(rows('custody_event'), 'shipment_id'),
    assignmentsByShipment: group(rows('logger_assignment'), 'shipment_id'),
    assignmentsByLogger: group(rows('logger_assignment'), 'logger_id'),
    calibrationsByLogger: group(rows('logger_calibration'), 'logger_id'),
    legacyReportsByShipment: group(rows('legacy_report'), 'shipment_id'),
    excursionsByShipment: group(rows('excursion_report'), 'shipment_id'),
    packagingByShipment: new Map([...group(rows('shipment_packaging'), 'shipment_id')]
      .map(([k, v]) => [k, v.map((sp) => ({ ...sp, profile: packagingById.get(sp.packaging_id) ?? null }))])),
    // readings of one logger with from <= recorded_at <= to, via binary search (no full scans)
    windowReadings(loggerId, fromMs, toMs) {
      if (readingStore) return readingStore.windowReadings(loggerId, fromMs, toMs);
      const arr = readingsByLogger.get(loggerId);
      if (!arr) return [];
      return arr.slice(lowerBound(arr, fromMs), upperBound(arr, toMs));
    },
  };
}
