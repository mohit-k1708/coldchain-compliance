import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeDb, startServer } from './helpers.js';
import { ROLES, PERMISSIONS } from '../../server/roles.js';

const { db } = makeDb();
const srv = await startServer(db);
after(() => srv.close());

const ok = (r, status = 201) => { assert.equal(r.status, status, `${r.status} ${r.text.slice(0, 300)}`); return r.json; };
const T = (hhmm, day = '10') => `2026-03-${day}T${hhmm}:00Z`;

// Creates a complete DELIVERED shipment purely through the API. temps: (index, "HH:MM") -> temperature
async function flow({ omit = [], temp = (i, t) => (t >= '11:00' && t < '12:00' ? 9.5 : 5), suffix = '' } = {}) {
  const supplier = ok(await srv.post('/api/parties', { party_name: `ACME Pharma ${suffix}`, party_type: 'SUPPLIER' }, 'supplier'));
  const carrier = ok(await srv.post('/api/parties', { party_name: `FrostLine ${suffix}`, party_type: 'CARRIER' }, 'planner'));
  const wh = ok(await srv.post('/api/parties', { party_name: `Depot ${suffix}`, party_type: 'WAREHOUSE' }, 'planner'));
  const product = ok(await srv.post('/api/products', { product_name: `Vaccine ${suffix}`, category: 'VACCINE', supplier_party_id: supplier.party_id, required_min_temp_c: 2, required_max_temp_c: 8, max_excursion_minutes: 30, created_at: '2026-01-01T00:00:00Z' }, 'supplier'));
  const policy = ok(await srv.post('/api/policies', { product_id: product.product_id, min_temp_c: 2, max_temp_c: 8, max_excursion_minutes: 30, max_data_gap_minutes: 20, sampling_interval_minutes: 10, max_dwell_minutes: 120, effective_from: '2026-01-01T00:00:00Z' }, 'supplier'));
  const lot = ok(await srv.post('/api/lots', { product_id: product.product_id, manufacturing_date: '2025-09-01', expiry_date: '2027-03-01' }, 'supplier'));
  const pkg = ok(await srv.post('/api/packaging', { packaging_type: 'Passive 2-8C', min_supported_temp_c: 0, max_supported_temp_c: 10, qualified_duration_hours: 96 }, 'planner'));
  const logger = ok(await srv.post('/api/loggers', { device_serial_number: `SN-E2E-${suffix}`, calibration: { calibrated_on: '2026-01-01', expires_on: '2027-01-01', uncertainty_c: 0.3 } }, 'planner'));
  const sh = ok(await srv.post('/api/shipments', { product_id: product.product_id, origin_location: 'Boston', destination_location: 'Denver', origin_party_id: supplier.party_id, destination_party_id: wh.party_id,
    planned_departure: T('10:00'), planned_arrival: T('16:00'), created_at: '2026-03-01T00:00:00Z', packaging_id: pkg.packaging_id, lots: [{ lot_id: lot.lot_id, quantity_units: 100 }] }, 'planner'));
  assert.equal(sh.policy_id, policy.policy_id);
  const sid = sh.shipment_id;
  ok(await srv.post(`/api/shipments/${sid}/assign-logger`, { logger_id: logger.logger_id, assigned_from: T('09:30'), assigned_to: T('16:30') }, 'planner'));
  ok(await srv.post(`/api/shipments/${sid}/status`, { to_status: 'PACKED', changed_at: T('08:00') }, 'planner'), 200);
  ok(await srv.post(`/api/shipments/${sid}/status`, { to_status: 'IN_TRANSIT', changed_at: T('10:00'), departure_time: T('10:00') }, 'carrier'), 200);
  ok(await srv.post(`/api/shipments/${sid}/custody-events`, { event_type: 'PICKUP', from_party_id: supplier.party_id, to_party_id: carrier.party_id, event_timestamp: T('10:00'), location: 'Boston' }, 'carrier'));
  ok(await srv.post(`/api/shipments/${sid}/custody-events`, { event_type: 'DELIVERY', from_party_id: carrier.party_id, to_party_id: wh.party_id, event_timestamp: T('16:00'), location: 'Denver' }, 'carrier'));
  ok(await srv.post(`/api/shipments/${sid}/route-stops`, { location: 'Boston', stop_type: 'ORIGIN', stop_sequence: 1, actual_sequence: 1, planned_arrival: T('09:30'), planned_departure: T('10:00'), actual_arrival: T('09:30'), actual_departure: T('10:00') }, 'planner'));
  ok(await srv.post(`/api/shipments/${sid}/route-stops`, { location: 'Denver', stop_type: 'DESTINATION', stop_sequence: 2, actual_sequence: 2, planned_arrival: T('16:00'), actual_arrival: T('16:00') }, 'carrier'));
  const readings = [];
  for (let m = 0, i = 0; m <= 360; m += 10, i++) {
    const hhmm = `${String(10 + Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    if (omit.includes(hhmm)) continue;
    readings.push({ logger_id: logger.logger_id, recorded_at: T(hhmm), temperature_c: temp(i, hhmm) });
  }
  const batch = ok(await srv.post('/api/readings/batch', { readings }, 'carrier'), 200);
  assert.equal(batch.accepted, readings.length);
  ok(await srv.post(`/api/shipments/${sid}/status`, { to_status: 'DELIVERED', changed_at: T('16:10'), arrival_time: T('16:00') }, 'carrier'), 200);
  return { sid, logger: logger.logger_id, product, supplier, carrier, wh, readings };
}

test('a: role gating table', async () => {
  const sample = [
    ['POST', '/api/products', 'products:create', {}],
    ['POST', '/api/lots', 'lots:create', {}],
    ['POST', '/api/policies', 'policies:create', {}],
    ['POST', '/api/parties', 'parties:create', {}],
    ['POST', '/api/shipments', 'shipments:create', {}],
    ['POST', '/api/packaging', 'packaging:create', {}],
    ['POST', '/api/loggers', 'loggers:create', {}],
    ['POST', '/api/shipments/SHP-2026-000001/assign-logger', 'shipments:assign-logger', {}],
    ['POST', '/api/shipments/SHP-2026-000001/custody-events', 'custody-events:create', {}],
    ['POST', '/api/shipments/SHP-2026-000001/route-stops', 'route-stops:create', {}],
    ['POST', '/api/shipments/SHP-2026-000001/status', 'shipments:status', {}],
    ['POST', '/api/readings/batch', 'readings:ingest', {}],
    ['POST', '/api/shipments/SHP-2026-000001/evaluate', 'shipments:evaluate', {}],
  ];
  for (const [method, path, perm, bodyObj] of sample) {
    for (const role of ROLES) {
      const res = await srv.call(method, path, { body: bodyObj, role });
      const allowed = PERMISSIONS[role].includes(perm);
      if (allowed) assert.notEqual(res.status, 403, `${role} should be allowed ${perm}`); else { assert.equal(res.status, 403, `${role} must be denied ${perm}`); assert.equal(res.json.error.code, 'FORBIDDEN'); }
    }
  }
  // explicit expectations from the brief
  assert.ok(PERMISSIONS.supplier.includes('products:create') && !PERMISSIONS.supplier.includes('shipments:create'));
  assert.ok(PERMISSIONS.planner.includes('shipments:assign-logger') && !PERMISSIONS.planner.includes('readings:ingest'));
  assert.ok(PERMISSIONS.carrier.includes('custody-events:create') && PERMISSIONS.carrier.includes('readings:ingest') && !PERMISSIONS.carrier.includes('shipments:evaluate'));
  assert.ok(PERMISSIONS.analyst.includes('shipments:evaluate') && PERMISSIONS.analyst.includes('exceptions:transition'));
  assert.ok(PERMISSIONS.manager.length === 1 && PERMISSIONS.manager[0] === 'exceptions:decide');
  // no role header defaults to analyst; reads are open to everyone; unknown role is a 400
  assert.equal((await srv.call('POST', '/api/products', { body: {} })).status, 403);
  assert.equal((await srv.call('GET', '/api/dashboard', { role: 'supplier' })).status, 200);
  assert.equal((await srv.call('POST', '/api/products', { body: {}, role: 'root' })).status, 400);
  // exception transitions: manager may decide but not assign; carrier may do nothing
  const ex = (await srv.get('/api/exceptions?status=OPEN&pageSize=1')).json.items[0];
  assert.equal((await srv.call('POST', `/api/exceptions/${ex.excursion_id}/transition`, { body: { event_id: 'R1', to_status: 'ASSIGNED', analyst: 'x' }, role: 'manager' })).status, 403);
  assert.equal((await srv.call('POST', `/api/exceptions/${ex.excursion_id}/transition`, { body: { event_id: 'R2', to_status: 'RESOLVED', resolution: 'x' }, role: 'carrier' })).status, 403);
});

test('b: readings ingestion with duplicates, invalid rows, and idempotent re-post', async () => {
  const f = await flow({ suffix: 'B' });
  const lg = f.logger;
  const before = db.prepare('SELECT count(*) n FROM temperature_reading WHERE logger_id = ?').get(lg).n;
  const day2 = (hhmm, extra = {}) => ({ logger_id: lg, recorded_at: T(hhmm, '11'), temperature_c: 5, ...extra });
  const batch = { readings: [
    day2('10:00'), day2('10:10'), day2('10:10', { temperature_c: 7 }), // 3rd = duplicate of 2nd inside the batch
    day2('10:15'), // off grid
    day2('10:20', { temperature_c: 99 }), // out of range
    day2('10:30', { reading_quality: 'GREAT' }),
    { logger_id: 'LGR-999999', recorded_at: T('10:40', '11'), temperature_c: 5 },
    { logger_id: lg, recorded_at: 'yesterday', temperature_c: 5 },
    day2('10:50', { reading_id: 'TEMP-WRONG' }),
    day2('11:00', { received_at: T('10:00', '11') }), // received before recorded
    'not an object', null,
    day2('11:10', { temperature_c: '5' }),
    day2('11:20'), // valid
  ] };
  const r1 = ok(await srv.post('/api/readings/batch', batch, 'carrier'), 200);
  assert.deepEqual([r1.accepted, r1.duplicates, r1.rejected.length], [3, 1, 10]);
  assert.deepEqual(r1.rejected.map((x) => x.index), [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.ok(r1.rejected.every((x) => typeof x.reason === 'string' && x.reason.length > 0));
  assert.equal(db.prepare('SELECT count(*) n FROM temperature_reading WHERE logger_id = ?').get(lg).n, before + 3);
  const stored = db.prepare('SELECT * FROM temperature_reading WHERE logger_id = ? AND recorded_at = ?').get(lg, T('10:10', '11'));
  assert.equal(stored.temperature_c, 5); // the first copy won; the duplicate did not overwrite
  // re-posting the same batch changes nothing
  const r2 = ok(await srv.post('/api/readings/batch', batch, 'carrier'), 200);
  assert.equal(r2.accepted, 0);
  assert.equal(r2.duplicates, 4);
  assert.deepEqual(r2.rejected, r1.rejected);
  assert.equal(db.prepare('SELECT count(*) n FROM temperature_reading WHERE logger_id = ?').get(lg).n, before + 3);
  assert.equal((await srv.post('/api/readings/batch', { readings: 'x' }, 'carrier')).status, 400);
});

test('c: late reading -> NEW run, old run kept; repeated evaluate creates none; exceptions are not duplicated', async () => {
  const f = await flow({ omit: ['12:30'], suffix: 'C' });
  const e1 = ok(await srv.post(`/api/shipments/${f.sid}/evaluate`, {}, 'analyst'));
  assert.equal(e1.created, true);
  assert.equal(e1.run.compliance_status, 'NON_COMPLIANT');
  const again = ok(await srv.post(`/api/shipments/${f.sid}/evaluate`, {}, 'analyst'), 200);
  assert.equal(again.created, false);
  assert.equal(again.run.compliance_run_id, e1.run.compliance_run_id);
  assert.equal(db.prepare('SELECT count(*) n FROM compliance_run WHERE shipment_id = ?').get(f.sid).n, 1);
  const exc1 = db.prepare("SELECT * FROM excursion_report WHERE shipment_id = ? AND source = 'ENGINE'").all(f.sid);
  assert.ok(exc1.length >= 1);
  // a late-arriving reading (received after arrival) fills the hole
  const late = ok(await srv.post('/api/readings/batch', { readings: [{ logger_id: f.logger, recorded_at: T('12:30'), temperature_c: 5, received_at: T('08:00', '11') }] }, 'carrier'), 200);
  assert.equal(late.accepted, 1);
  const e2 = ok(await srv.post(`/api/shipments/${f.sid}/evaluate`, {}, 'analyst'));
  assert.equal(e2.created, true);
  assert.notEqual(e2.run.input_fingerprint, e1.run.input_fingerprint);
  const runs = db.prepare('SELECT compliance_run_id id, is_current c FROM compliance_run WHERE shipment_id = ? ORDER BY compliance_run_id').all(f.sid);
  assert.deepEqual(runs.map((r) => r.c), [0, 1]); // old run kept, no longer current
  assert.equal(runs[0].id, e1.run.compliance_run_id);
  // no duplicate exceptions for the unchanged condition
  assert.equal(db.prepare("SELECT count(*) n FROM excursion_report WHERE shipment_id = ? AND source = 'ENGINE'").get(f.sid).n, exc1.length + e2.exceptions.created);
  assert.equal(e2.exceptions.created, 0);
  assert.equal(ok(await srv.post(`/api/shipments/${f.sid}/evaluate`, {}, 'analyst'), 200).created, false);
  assert.equal((await srv.get(`/api/shipments/${f.sid}`)).json.compliance_run.compliance_run_id, e2.run.compliance_run_id);
  // not-yet-delivered and unknown shipments
  assert.equal((await srv.post('/api/shipments/SHP-2026-999999/evaluate', {}, 'analyst')).status, 404);
});

test('d: exception transitions: rules, missing fields, idempotent event_id, history preserved', async () => {
  const f = await flow({ suffix: 'D' });
  ok(await srv.post(`/api/shipments/${f.sid}/evaluate`, {}, 'analyst'));
  const exc = (await srv.get(`/api/exceptions?shipmentId=${f.sid}`)).json.items[0];
  const url = `/api/exceptions/${exc.excursion_id}/transition`;
  const tr = (b, role = 'analyst') => srv.post(url, b, role);
  assert.equal(exc.status, 'OPEN');
  assert.equal((await tr({ event_id: 'D1', to_status: 'ASSIGNED' })).status, 400); // analyst required
  assert.equal((await tr({ event_id: 'D1', to_status: 'INVESTIGATING' })).status, 409); // OPEN -> INVESTIGATING illegal
  assert.equal((await tr({ event_id: 'D1', to_status: 'RESOLVED', resolution: 'x' })).status, 409);
  assert.equal((await tr({ event_id: 'D1', to_status: 'NOPE' })).status, 400);
  assert.equal((await tr({ to_status: 'ASSIGNED', analyst: 'a' })).status, 400); // event_id required
  const a1 = ok(await tr({ event_id: 'D1', to_status: 'ASSIGNED', analyst: 'Alice' }), 200);
  assert.equal(a1.exception.status, 'ASSIGNED');
  const dup = ok(await tr({ event_id: 'D1', to_status: 'ASSIGNED', analyst: 'Alice' }), 200); // same event twice
  assert.equal(dup.duplicate, true);
  assert.equal(db.prepare('SELECT count(*) n FROM exception_event WHERE excursion_id = ?').get(exc.excursion_id).n, 1);
  ok(await tr({ event_id: 'D2', to_status: 'INVESTIGATING' }), 200);
  assert.equal((await tr({ event_id: 'D3', to_status: 'ESCALATED' })).status, 400); // note required
  assert.equal((await tr({ event_id: 'D3', to_status: 'RESOLVED' })).status, 400); // resolution required
  const first = db.prepare('SELECT * FROM exception_event WHERE exception_event_id = ?').get('D1');
  ok(await tr({ event_id: 'D3', to_status: 'ESCALATED', note: 'needs QA' }, 'manager'), 200);
  const res = ok(await tr({ event_id: 'D4', to_status: 'RESOLVED', resolution: 'accepted' }, 'manager'), 200);
  assert.equal(res.exception.status, 'RESOLVED');
  assert.ok(res.exception.resolved_at);
  assert.equal((await tr({ event_id: 'D5', to_status: 'INVESTIGATING' })).status, 409); // RESOLVED is terminal
  const d = (await srv.get(`/api/exceptions/${exc.excursion_id}`)).json;
  assert.deepEqual(d.history.map((h) => h.to_status), ['ASSIGNED', 'INVESTIGATING', 'ESCALATED', 'RESOLVED']);
  assert.deepEqual(db.prepare('SELECT * FROM exception_event WHERE exception_event_id = ?').get('D1'), first); // old event untouched
  assert.equal(d.exception.status, 'RESOLVED');
  assert.equal((await tr({ event_id: 'D9', to_status: 'ASSIGNED', analyst: 'a' }, 'analyst')).status, 409);
  assert.equal((await srv.post('/api/exceptions/EXCR-NOPE/transition', { event_id: 'Z', to_status: 'ASSIGNED', analyst: 'a' }, 'analyst')).status, 404);
  // an event id already used by another exception cannot be reused
  const other = (await srv.get('/api/exceptions?status=OPEN&pageSize=1')).json.items[0];
  assert.equal((await srv.post(`/api/exceptions/${other.excursion_id}/transition`, { event_id: 'D1', to_status: 'ASSIGNED', analyst: 'a' }, 'analyst')).status, 409);
});

test('e: overlapping logger assignment is rejected with 409', async () => {
  const f = await flow({ suffix: 'E' });
  const mk = async (n) => ok(await srv.post('/api/shipments', { product_id: f.product.product_id, origin_location: 'A', destination_location: 'B', origin_party_id: f.supplier.party_id, destination_party_id: f.wh.party_id,
    planned_departure: T('10:00', n), planned_arrival: T('16:00', n), lots: [{ lot_id: db.prepare('SELECT lot_id FROM lot WHERE product_id = ?').get(f.product.product_id).lot_id, quantity_units: 1 }] }, 'planner'));
  const s2 = await mk('20');
  const clash = await srv.post(`/api/shipments/${s2.shipment_id}/assign-logger`, { logger_id: f.logger, assigned_from: T('12:00'), assigned_to: T('13:00') }, 'planner');
  assert.equal(clash.status, 409);
  assert.equal(clash.json.error.code, 'ASSIGNMENT_OVERLAP');
  const open = await srv.post(`/api/shipments/${s2.shipment_id}/assign-logger`, { logger_id: f.logger, assigned_from: T('16:00') }, 'planner'); // open-ended, starts before the first ends
  assert.equal(open.status, 409);
  ok(await srv.post(`/api/shipments/${s2.shipment_id}/assign-logger`, { logger_id: f.logger, assigned_from: T('16:30'), assigned_to: T('18:00') }, 'planner')); // touching boundary is fine
  assert.equal((await srv.post(`/api/shipments/${s2.shipment_id}/assign-logger`, { logger_id: f.logger, assigned_from: T('17:00'), assigned_to: T('19:00') }, 'planner')).status, 409);
  assert.equal((await srv.post(`/api/shipments/${s2.shipment_id}/assign-logger`, { logger_id: 'LGR-999999', assigned_from: T('20:00') }, 'planner')).status, 400);
  assert.equal((await srv.post(`/api/shipments/${s2.shipment_id}/assign-logger`, { logger_id: f.logger, assigned_from: T('20:00'), assigned_to: T('19:00') }, 'planner')).status, 400);
});

test('f: bad input always yields JSON errors, never a 500', async () => {
  const bad = await srv.call('POST', '/api/products', { raw: '{"product_name": ', role: 'supplier', body: {} });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error.code, 'INVALID_JSON');
  const arr = await srv.call('POST', '/api/products', { raw: '[1,2]', role: 'supplier', body: {} });
  assert.equal(arr.status, 400);
  const cases = [
    ['/api/products', { product_name: 5, category: 'VACCINE', supplier_party_id: 'x', required_min_temp_c: 2, required_max_temp_c: 8, max_excursion_minutes: 30 }, 'supplier'],
    ['/api/products', { product_name: 'p', category: 'VACCINE', supplier_party_id: 'x', required_min_temp_c: '2', required_max_temp_c: 8, max_excursion_minutes: 30 }, 'supplier'],
    ['/api/products', { product_name: 'p', category: 'VACCINE', supplier_party_id: 'PTY-999999', required_min_temp_c: 2, required_max_temp_c: 8, max_excursion_minutes: 30 }, 'supplier'], // unknown FK
    ['/api/products', { product_name: 'p', category: 'FOOD', supplier_party_id: 'x', required_min_temp_c: 2, required_max_temp_c: 8, max_excursion_minutes: 30 }, 'supplier'],
    ['/api/products', { product_name: 'p', category: 'VACCINE', supplier_party_id: 'x', required_min_temp_c: 9, required_max_temp_c: 8, max_excursion_minutes: 30 }, 'supplier'],
    ['/api/lots', { product_id: 'PRD-999999', manufacturing_date: '2025-01-01', expiry_date: '2026-01-01' }, 'supplier'], // unknown FK
    ['/api/lots', { product_id: 'PRD-000001', manufacturing_date: 'not-a-date', expiry_date: '2026-01-01' }, 'supplier'],
    ['/api/policies', { product_id: 'PRD-999999', min_temp_c: 2, max_temp_c: 8, max_excursion_minutes: 1, max_data_gap_minutes: 1, sampling_interval_minutes: 1, max_dwell_minutes: 1, effective_from: '2026-01-01T00:00:00Z' }, 'supplier'],
    ['/api/shipments', { product_id: 'PRD-999999', origin_location: 'A', destination_location: 'B', origin_party_id: 'x', destination_party_id: 'y', planned_departure: T('10:00'), planned_arrival: T('11:00'), lots: [{ lot_id: 'L', quantity_units: 1 }] }, 'planner'],
    ['/api/shipments', { product_id: 'PRD-000001', origin_location: 'A', destination_location: 'A', origin_party_id: 'x', destination_party_id: 'y', planned_departure: T('10:00'), planned_arrival: T('11:00'), lots: [] }, 'planner'],
    ['/api/loggers', { device_serial_number: 'x' }, 'planner'],
    ['/api/loggers', { device_serial_number: 'x', calibration: 'now' }, 'planner'],
    ['/api/parties', { party_name: 'x', party_type: 'ALIEN' }, 'planner'],
    ['/api/shipments/SHP-2026-999999/custody-events', { event_type: 'PICKUP', event_timestamp: T('10:00') }, 'carrier'],
    ['/api/shipments/SHP-2026-999999/route-stops', { location: 'x', stop_type: 'ORIGIN', planned_arrival: T('10:00') }, 'planner'],
    ['/api/shipments/SHP-2026-999999/status', { to_status: 'PACKED' }, 'planner'],
    ['/api/readings/batch', 'plain string', 'carrier'],
  ];
  for (const [path, payload, role] of cases) {
    const r = await srv.post(path, payload, role);
    assert.ok(r.status >= 400 && r.status < 500, `${path} ${JSON.stringify(payload).slice(0, 60)} -> ${r.status}`);
    assert.equal(typeof r.json?.error?.code, 'string', path);
    assert.ok(!/at .*\.js|stack|SQLITE/i.test(r.text), `leak in ${path}: ${r.text}`);
  }
  const garbage = ok(await srv.post('/api/readings/batch', { readings: [1, 'a', null, [], {}] }, 'carrier'), 200); // bad rows never abort a batch
  assert.deepEqual([garbage.accepted, garbage.rejected.length], [0, 5]);
  const huge = await srv.call('POST', '/api/readings/batch', { raw: JSON.stringify({ readings: [], pad: 'x'.repeat(6 * 1024 * 1024) }), role: 'carrier', body: {} });
  assert.equal(huge.status, 413);
  assert.equal(huge.json.error.code, 'PAYLOAD_TOO_LARGE');
  // status transitions are legal-only
  const f = await flow({ suffix: 'F' });
  const sid = f.sid;
  assert.equal((await srv.post(`/api/shipments/${sid}/status`, { to_status: 'PACKED' }, 'planner')).status, 409);
  assert.equal((await srv.post(`/api/shipments/${sid}/status`, { to_status: 'IN_TRANSIT' }, 'planner')).status, 409);
});

test('g: END-TO-END through the API: ... -> evaluate -> NON_COMPLIANT [R-TEMP-03] -> report -> exceptions -> assign -> investigate -> escalate -> resolve', async () => {
  const f = await flow({ suffix: 'G' });
  const ev = ok(await srv.post(`/api/shipments/${f.sid}/evaluate`, {}, 'analyst'));
  assert.equal(ev.run.compliance_status, 'NON_COMPLIANT');
  assert.ok(ev.run.reason_summary.startsWith('NON_COMPLIANT [R-TEMP-03]'), ev.run.reason_summary);

  const detail = (await srv.get(`/api/shipments/${f.sid}`)).json;
  assert.equal(detail.compliance_run.compliance_status, 'NON_COMPLIANT');
  assert.equal(detail.policy_used.policy_id, detail.applied_policy.policy_id);

  const md = (await srv.get(`/api/shipments/${f.sid}/report?format=md`)).text;
  assert.ok(md.includes('Confirmed out-of-range: 60 = 60 min > 30 min allowed'), 'arithmetic line');
  const cited = md.match(/TEMP-LGR-\d{6}-\d{8}T\d{6}Z/g);
  assert.ok(cited && cited.length > 0);
  for (const id of new Set(cited)) assert.ok(db.prepare('SELECT 1 FROM temperature_reading WHERE reading_id = ?').get(id), `cited reading ${id} exists`);
  const html = await srv.get(`/api/shipments/${f.sid}/report?format=html`);
  assert.ok(html.text.includes('NON_COMPLIANT'));

  const list = (await srv.get(`/api/exceptions?shipmentId=${f.sid}`)).json;
  const temp = list.items.find((x) => x.issue_type === 'TEMP_HIGH');
  assert.ok(temp && temp.status === 'OPEN' && temp.duration_minutes === 60);
  const url = `/api/exceptions/${temp.excursion_id}/transition`;
  ok(await srv.post(url, { event_id: 'G1', to_status: 'ASSIGNED', analyst: 'Alice Chen' }, 'analyst'), 200);
  ok(await srv.post(url, { event_id: 'G2', to_status: 'INVESTIGATING', note: 'logger data reviewed' }, 'analyst'), 200);
  ok(await srv.post(url, { event_id: 'G3', to_status: 'ESCALATED', note: 'needs QA sign-off' }, 'analyst'), 200);
  const done = ok(await srv.post(url, { event_id: 'G4', to_status: 'RESOLVED', resolution: 'product quarantined' }, 'manager'), 200);
  assert.equal(done.exception.status, 'RESOLVED');
  const d = (await srv.get(`/api/exceptions/${temp.excursion_id}`)).json;
  assert.equal(d.history.length, 4);
  assert.deepEqual(d.history.map((h) => h.exception_event_id), ['G1', 'G2', 'G3', 'G4']);
  assert.equal(d.exception.assigned_analyst, 'Alice Chen');
  assert.equal(d.exception.resolution, 'product quarantined');
  assert.ok(d.evidence_count > 0);
  // the dashboard sees the new shipment
  const dash = (await srv.get('/api/dashboard')).json;
  assert.ok(dash.non_compliant >= 1 && dash.total_shipments > 15);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});
