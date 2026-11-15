import * as ids from './ids.js';
import { iso, ymd, parse, addYears, DAY } from './time.js';

const SUPPLIERS = ['Nordic Biologics', 'Helix Pharma', 'Aurora Labs'];
const CARRIERS = ['FrostLine Logistics', 'ArcticFreight', 'CoolRoute', 'PolarExpress', 'ChillTrans', 'IceWay Cargo'];
const WAREHOUSES = ['Central Cold Store', 'Harbor Depot', 'Metro Pharma Hub', 'Northgate Warehouse', 'Riverside Cold Storage', 'Summit Distribution'];

// [name, category, min, max, max_excursion_minutes]
const PRODUCTS = [
  ['Vaccine A', 'VACCINE', 2, 8, 30],
  ['Biologic B', 'BIOLOGIC', 2, 8, 45],
  ['Insulin C', 'INSULIN', 2, 8, 60],
  ['Frozen Vaccine D', 'VACCINE', -25, -15, 20],
  ['Ambient Product E', 'OTHER', 15, 25, 120],
];
// [type, min, max, hours]
const PACKAGING = [
  ['Passive insulated shipper 2-8C', 0, 10, 96],
  ['Deep-frozen shipper', -30, -10, 96],
  ['Ambient shipper 15-25C', 10, 30, 48],
];

export function generateMasterData(rng, { loggers }) {
  const T0 = '2026-01-01T00:00:00Z';
  const party = [];
  let pn = 0;
  for (const [names, type] of [[SUPPLIERS, 'SUPPLIER'], [CARRIERS, 'CARRIER'], [WAREHOUSES, 'WAREHOUSE']]) {
    for (const party_name of names) party.push({ party_id: ids.partyId(++pn), party_name, party_type: type });
  }
  const suppliers = party.filter((p) => p.party_type === 'SUPPLIER');

  const product = PRODUCTS.map(([product_name, category, mn, mx, exc], i) => ({
    product_id: ids.productId(i + 1), product_name, category,
    supplier_party_id: suppliers[i % suppliers.length].party_id,
    required_min_temp_c: mn, required_max_temp_c: mx, max_excursion_minutes: exc, created_at: T0,
  }));

  const lot = [];
  let ln = 0;
  for (const p of product) {
    for (const [mfg, exp] of [['2025-09-01', '2027-03-01'], ['2025-11-01', '2027-05-01']]) {
      lot.push({ lot_id: ids.lotId(++ln), product_id: p.product_id, manufacturing_date: mfg, expiry_date: exp,
        lot_status: 'RELEASED', created_at: '2025-12-01T00:00:00Z' });
    }
  }

  const packaging = PACKAGING.map(([packaging_type, mn, mx, h], i) => ({
    packaging_id: ids.packagingId(i + 1), packaging_type, min_supported_temp_c: mn, max_supported_temp_c: mx,
    qualified_duration_hours: h, packaging_status: 'ACTIVE',
  }));

  const logger = [], logger_calibration = [];
  const calStart = parse('2026-01-01');
  const lapsedCount = Math.min(loggers - 1, Math.max(2, Math.round(0.03 * loggers)));
  for (let i = 1; i <= loggers; i++) {
    const lapsed = i > loggers - lapsedCount; // last ids are "lapsed" loggers
    // Normal loggers are calibrated 2026-01-01..14 so they are valid for every departure (>= Jan 15).
    const on = lapsed ? parse('2025-02-01') : calStart + rng.int(0, 13) * DAY;
    const exp = lapsed ? parse('2026-02-01') : addYears(on, 1);
    const unc = rng.int(20, 50) / 100;
    const logger_id = ids.loggerId(i);
    logger_calibration.push({ calibration_id: ids.calibrationId(i), logger_id, calibrated_on: ymd(on),
      expires_on: ymd(exp), uncertainty_c: unc });
    logger.push({ logger_id, device_serial_number: `SN-${100000 + i}-${rng.int(1000, 9999)}`,
      calibration_status: lapsed ? 'EXPIRED' : 'VALID', calibration_date: ymd(on), calibration_expiry: ymd(exp),
      calibration_uncertainty_c: unc, device_status: 'AVAILABLE' });
  }

  const threshold_policy = [];
  product.forEach((p, i) => {
    const base = { product_id: p.product_id, min_temp_c: p.required_min_temp_c, max_temp_c: p.required_max_temp_c,
      max_excursion_minutes: p.max_excursion_minutes, max_data_gap_minutes: 30, sampling_interval_minutes: 10 };
    threshold_policy.push({ policy_id: ids.policyId(2 * i + 1), ...base, policy_version: 1, max_dwell_minutes: 120,
      effective_from: T0, effective_to: '2026-09-01T00:00:00Z', policy_status: 'SUPERSEDED' });
    threshold_policy.push({ policy_id: ids.policyId(2 * i + 2), ...base, policy_version: 2, max_dwell_minutes: 90,
      effective_from: '2026-09-01T00:00:00Z', effective_to: null, policy_status: 'ACTIVE' });
  });

  return { party, product, lot, packaging, logger, logger_calibration, threshold_policy };
}
