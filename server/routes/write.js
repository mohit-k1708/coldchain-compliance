import { Router } from 'express';
import { all, get, run, tx, nextNumber } from '../db.js';
import { wrap, body, validate, badRequest, notFound, conflict, nowIso, forbidden, HttpError } from '../http.js';
import { requires, roleOf, can } from '../roles.js';
import { loadSlice } from '../loadSlice.js';
import * as ids from '../../generator/ids.js';
import { buildIndexes } from '../../engine/indexes.js';
import { evaluateShipment, materialize } from '../../engine/index.js';
import { applyTransition, reconcileExceptions, ExceptionError } from '../../engine/exceptions.js';
import { ms, iso } from '../../engine/time.js';

const PARTY_TYPES = ['SUPPLIER', 'CARRIER', 'WAREHOUSE'];
const CATEGORIES = ['VACCINE', 'BIOLOGIC', 'INSULIN', 'OTHER'];
const LOT_STATUS = ['CREATED', 'RELEASED', 'QUARANTINED', 'EXPIRED'];
const POLICY_STATUS = ['DRAFT', 'ACTIVE', 'SUPERSEDED', 'RETIRED'];
const QUALITY = ['GOOD', 'SUSPECT', 'INVALID'];
const STATUS_FLOW = { PLANNED: ['PACKED', 'CANCELLED'], PACKED: ['IN_TRANSIT', 'CANCELLED'], IN_TRANSIT: ['DELIVERED'], DELIVERED: [], CANCELLED: [] };
const FAR = '9999-12-31T23:59:59Z';
const MIN = 60000;

const nextId = (db, table, col, prefix) => nextNumber(db, table, col, prefix);
const need = (cond, msg) => { if (!cond) throw badRequest(msg); };
const shipmentOr404 = (db, id) => get(db, 'SELECT * FROM shipment WHERE shipment_id = ?', id) ?? (() => { throw notFound(`shipment ${id} not found`); })();

export function writeRoutes(db) {
  const r = Router();
  const created = (res, obj) => res.status(201).json(obj);

  // ---- master data -----------------------------------------------------------------------------------------
  r.post('/parties', requires('parties:create'), wrap((req, res) => {
    const b = validate(body(req), { party_name: 'string', party_type: PARTY_TYPES });
    created(res, tx(db, () => {
      const id = ids.partyId(nextId(db, 'party', 'party_id', 'PTY-'));
      run(db, 'INSERT INTO party (party_id, party_name, party_type) VALUES (?, ?, ?)', id, b.party_name, b.party_type);
      return { party_id: id, ...b };
    }));
  }));

  r.post('/products', requires('products:create'), wrap((req, res) => {
    const b = validate(body(req), { product_name: 'string', category: CATEGORIES, supplier_party_id: 'string', required_min_temp_c: 'number', required_max_temp_c: 'number', max_excursion_minutes: 'int', created_at: 'ts?' });
    need(b.required_max_temp_c >= b.required_min_temp_c, 'required_max_temp_c must be >= required_min_temp_c');
    need(b.max_excursion_minutes >= 0, 'max_excursion_minutes must be >= 0');
    created(res, tx(db, () => {
      const id = ids.productId(nextId(db, 'product', 'product_id', 'PRD-'));
      run(db, 'INSERT INTO product VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, b.product_name, b.category, b.supplier_party_id, b.required_min_temp_c, b.required_max_temp_c, b.max_excursion_minutes, b.created_at ?? nowIso());
      return { product_id: id, ...b };
    }));
  }));

  r.post('/policies', requires('policies:create'), wrap((req, res) => {
    const raw = body(req);
    const b = validate(raw, { product_id: 'string', min_temp_c: 'number', max_temp_c: 'number', max_excursion_minutes: 'int', max_data_gap_minutes: 'int', sampling_interval_minutes: 'int', max_dwell_minutes: 'int', effective_from: 'ts', effective_to: 'ts?' });
    const status = raw.policy_status === undefined ? 'ACTIVE' : raw.policy_status;
    need(POLICY_STATUS.includes(status), `policy_status must be one of ${POLICY_STATUS.join(', ')}`);
    need(b.max_temp_c >= b.min_temp_c, 'max_temp_c must be >= min_temp_c');
    need(b.max_excursion_minutes >= 0 && b.max_dwell_minutes >= 0, 'minutes must be >= 0');
    need(b.max_data_gap_minutes > 0 && b.sampling_interval_minutes > 0, 'max_data_gap_minutes and sampling_interval_minutes must be > 0');
    need(!b.effective_to || b.effective_to > b.effective_from, 'effective_to must be after effective_from');
    created(res, tx(db, () => {
      if (!get(db, 'SELECT 1 x FROM product WHERE product_id = ?', b.product_id)) throw badRequest('product does not exist', 'UNKNOWN_REFERENCE');
      const open = get(db, 'SELECT * FROM threshold_policy WHERE product_id = ? AND effective_to IS NULL ORDER BY policy_version DESC LIMIT 1', b.product_id);
      if (open && b.effective_to === null) {
        if (open.effective_from >= b.effective_from) throw conflict('a policy that is already open-ended starts at or after this effective_from', 'POLICY_OVERLAP');
        run(db, "UPDATE threshold_policy SET effective_to = ?, policy_status = 'SUPERSEDED' WHERE policy_id = ?", b.effective_from, open.policy_id); // keep exactly one effective policy
      }
      const version = (get(db, 'SELECT max(policy_version) v FROM threshold_policy WHERE product_id = ?', b.product_id).v ?? 0) + 1;
      const id = ids.policyId(nextId(db, 'threshold_policy', 'policy_id', 'POL-'));
      run(db, 'INSERT INTO threshold_policy VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', id, b.product_id, version, b.min_temp_c, b.max_temp_c, b.max_excursion_minutes, b.max_data_gap_minutes, b.sampling_interval_minutes, b.max_dwell_minutes, b.effective_from, b.effective_to, status);
      return { policy_id: id, policy_version: version, policy_status: status, ...b };
    }));
  }));

  r.post('/lots', requires('lots:create'), wrap((req, res) => {
    const raw = body(req);
    const b = validate(raw, { product_id: 'string', manufacturing_date: 'date', expiry_date: 'date', created_at: 'ts?' });
    const status = raw.lot_status ?? 'RELEASED';
    need(LOT_STATUS.includes(status), `lot_status must be one of ${LOT_STATUS.join(', ')}`);
    need(b.expiry_date > b.manufacturing_date, 'expiry_date must be after manufacturing_date');
    created(res, tx(db, () => {
      const id = ids.lotId(nextId(db, 'lot', 'lot_id', 'LOT-2026-'));
      run(db, 'INSERT INTO lot VALUES (?, ?, ?, ?, ?, ?)', id, b.product_id, b.manufacturing_date, b.expiry_date, status, b.created_at ?? nowIso());
      return { lot_id: id, lot_status: status, ...b };
    }));
  }));

  r.post('/packaging', requires('packaging:create'), wrap((req, res) => {
    const raw = body(req);
    const b = validate(raw, { packaging_type: 'string', min_supported_temp_c: 'number', max_supported_temp_c: 'number', qualified_duration_hours: 'int' });
    const status = raw.packaging_status ?? 'ACTIVE';
    need(['ACTIVE', 'RETIRED'].includes(status), 'packaging_status must be ACTIVE or RETIRED');
    need(b.max_supported_temp_c >= b.min_supported_temp_c, 'max_supported_temp_c must be >= min_supported_temp_c');
    need(b.qualified_duration_hours > 0, 'qualified_duration_hours must be > 0');
    created(res, tx(db, () => {
      const id = ids.packagingId(nextId(db, 'packaging', 'packaging_id', 'PKG-'));
      run(db, 'INSERT INTO packaging VALUES (?, ?, ?, ?, ?, ?)', id, b.packaging_type, b.min_supported_temp_c, b.max_supported_temp_c, b.qualified_duration_hours, status);
      return { packaging_id: id, packaging_status: status, ...b };
    }));
  }));

  r.post('/loggers', requires('loggers:create'), wrap((req, res) => {
    const raw = body(req);
    const b = validate(raw, { device_serial_number: 'string' });
    need(raw.calibration && typeof raw.calibration === 'object' && !Array.isArray(raw.calibration), 'calibration object is required');
    const c = validate(raw.calibration, { calibrated_on: 'date', expires_on: 'date', uncertainty_c: 'number' });
    need(c.expires_on > c.calibrated_on, 'calibration.expires_on must be after calibrated_on');
    need(c.uncertainty_c >= 0, 'calibration.uncertainty_c must be >= 0');
    created(res, tx(db, () => {
      const id = ids.loggerId(nextId(db, 'logger', 'logger_id', 'LGR-'));
      run(db, 'INSERT INTO logger VALUES (?, ?, ?, ?, ?, ?, ?)', id, b.device_serial_number, 'VALID', c.calibrated_on, c.expires_on, c.uncertainty_c, 'AVAILABLE');
      const cid = ids.calibrationId(nextId(db, 'logger_calibration', 'calibration_id', 'CAL-'));
      run(db, 'INSERT INTO logger_calibration VALUES (?, ?, ?, ?, ?)', cid, id, c.calibrated_on, c.expires_on, c.uncertainty_c);
      return { logger_id: id, calibration_id: cid, ...b, calibration: c };
    }));
  }));

  // ---- shipments -------------------------------------------------------------------------------------------
  r.post('/shipments', requires('shipments:create'), wrap((req, res) => {
    const raw = body(req);
    const b = validate(raw, { product_id: 'string', origin_location: 'string', destination_location: 'string', origin_party_id: 'string', destination_party_id: 'string', planned_departure: 'ts', planned_arrival: 'ts', created_at: 'ts?', packaging_id: 'string?' });
    need(b.planned_arrival > b.planned_departure, 'planned_arrival must be after planned_departure');
    need(b.origin_location !== b.destination_location, 'destination_location must differ from origin_location');
    need(Array.isArray(raw.lots) && raw.lots.length > 0, 'lots must be a non-empty array');
    const lots = raw.lots.map((l, i) => { need(l && typeof l === 'object', `lots[${i}] must be an object`); return validate(l, { lot_id: 'string', quantity_units: 'int' }); });
    need(lots.every((l) => l.quantity_units > 0), 'quantity_units must be > 0');
    created(res, tx(db, () => {
      if (!get(db, 'SELECT 1 x FROM product WHERE product_id = ?', b.product_id)) throw badRequest('product does not exist', 'UNKNOWN_REFERENCE');
      for (const l of lots) {
        const lot = get(db, 'SELECT product_id FROM lot WHERE lot_id = ?', l.lot_id);
        if (!lot) throw badRequest(`lot ${l.lot_id} does not exist`, 'UNKNOWN_REFERENCE');
        if (lot.product_id !== b.product_id) throw badRequest(`lot ${l.lot_id} belongs to another product`, 'LOT_PRODUCT_MISMATCH');
      }
      const policy = get(db, 'SELECT * FROM threshold_policy WHERE product_id = ? AND effective_from <= ? AND (effective_to IS NULL OR effective_to > ?) ORDER BY policy_version DESC LIMIT 1', b.product_id, b.planned_departure, b.planned_departure);
      if (!policy) throw conflict('no policy of this product is effective at the planned departure', 'NO_EFFECTIVE_POLICY');
      const sid = ids.shipmentId(nextId(db, 'shipment', 'shipment_id', 'SHP-2026-'));
      const createdAt = b.created_at ?? nowIso();
      run(db, 'INSERT INTO shipment (shipment_id, product_id, policy_id, origin_location, destination_location, origin_party_id, destination_party_id, planned_departure, planned_arrival, departure_time, arrival_time, shipment_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)',
        sid, b.product_id, policy.policy_id, b.origin_location, b.destination_location, b.origin_party_id, b.destination_party_id, b.planned_departure, b.planned_arrival, 'PLANNED', createdAt);
      for (const l of lots) run(db, 'INSERT INTO shipment_lot VALUES (?, ?, ?)', sid, l.lot_id, l.quantity_units);
      if (b.packaging_id) run(db, 'INSERT INTO shipment_packaging VALUES (?, ?, ?, NULL)', sid, b.packaging_id, b.planned_departure);
      run(db, 'INSERT INTO shipment_status_history VALUES (?, ?, NULL, ?, ?, ?)', ids.historyId(nextId(db, 'shipment_status_history', 'history_id', 'HST-2026-')), sid, 'PLANNED', createdAt, 'api');
      return { shipment_id: sid, policy_id: policy.policy_id, policy_version: policy.policy_version, shipment_status: 'PLANNED', lots, ...b };
    }));
  }));

  r.post('/shipments/:id/assign-logger', requires('shipments:assign-logger'), wrap((req, res) => {
    const b = validate(body(req), { logger_id: 'string', assigned_from: 'ts', assigned_to: 'ts?' });
    need(!b.assigned_to || b.assigned_to >= b.assigned_from, 'assigned_to must not be before assigned_from');
    created(res, tx(db, () => {
      const s = shipmentOr404(db, req.params.id);
      if (!get(db, 'SELECT 1 x FROM logger WHERE logger_id = ?', b.logger_id)) throw badRequest('logger does not exist', 'UNKNOWN_REFERENCE');
      const overlap = get(db, "SELECT logger_assignment_id id FROM logger_assignment WHERE logger_id = ? AND assignment_status != 'CANCELLED' AND assigned_from < ? AND COALESCE(assigned_to, ?) > ? LIMIT 1",
        b.logger_id, b.assigned_to ?? FAR, FAR, b.assigned_from);
      if (overlap) throw conflict(`logger ${b.logger_id} is already assigned in that period (${overlap.id})`, 'ASSIGNMENT_OVERLAP');
      const nn = get(db, 'SELECT count(*) n FROM logger_assignment WHERE shipment_id = ?', s.shipment_id).n + 1;
      const id = ids.assignmentId(s.shipment_id, nn);
      run(db, 'INSERT INTO logger_assignment VALUES (?, ?, ?, ?, ?, ?)', id, b.logger_id, s.shipment_id, b.assigned_from, b.assigned_to, 'ASSIGNED');
      return { logger_assignment_id: id, shipment_id: s.shipment_id, assignment_status: 'ASSIGNED', ...b };
    }));
  }));

  r.post('/shipments/:id/custody-events', requires('custody-events:create'), wrap((req, res) => {
    const raw = body(req);
    const b = validate(raw, { event_type: ['PICKUP', 'HANDOVER', 'DELIVERY'], event_timestamp: 'ts', recorded_at: 'ts?', from_party_id: 'string?', to_party_id: 'string?', location: 'string?' });
    created(res, tx(db, () => {
      const s = shipmentOr404(db, req.params.id);
      const seq = (get(db, 'SELECT max(event_sequence) m FROM custody_event WHERE shipment_id = ?', s.shipment_id).m ?? 0) + 1;
      const id = ids.custodyId(nextId(db, 'custody_event', 'custody_event_id', 'CUS-2026-'));
      run(db, 'INSERT INTO custody_event VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', id, s.shipment_id, seq, b.from_party_id, b.to_party_id, b.event_type, b.event_timestamp, b.recorded_at ?? b.event_timestamp, b.location);
      return { custody_event_id: id, shipment_id: s.shipment_id, event_sequence: seq, ...b };
    }));
  }));

  r.post('/shipments/:id/route-stops', requires('route-stops:create'), wrap((req, res) => {
    const raw = body(req);
    const b = validate(raw, { location: 'string', stop_type: ['ORIGIN', 'TRANSIT', 'DESTINATION'], stop_sequence: 'int?', actual_sequence: 'int?', planned_arrival: 'ts?', planned_departure: 'ts?', actual_arrival: 'ts?', actual_departure: 'ts?' });
    need(b.planned_arrival || b.actual_arrival, 'planned_arrival or actual_arrival is required');
    need(!b.planned_arrival || !b.planned_departure || b.planned_departure >= b.planned_arrival, 'planned_departure must not be before planned_arrival');
    need(!b.actual_arrival || !b.actual_departure || b.actual_departure >= b.actual_arrival, 'actual_departure must not be before actual_arrival');
    created(res, tx(db, () => {
      const s = shipmentOr404(db, req.params.id);
      const id = ids.routeStopId(nextId(db, 'route_stop', 'route_stop_id', 'RST-2026-'));
      run(db, 'INSERT INTO route_stop VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', id, s.shipment_id, b.location, b.stop_type, b.stop_sequence, b.actual_sequence, b.planned_arrival, b.planned_departure, b.actual_arrival, b.actual_departure);
      return { route_stop_id: id, shipment_id: s.shipment_id, ...b };
    }));
  }));

  r.post('/shipments/:id/status', requires('shipments:status'), wrap((req, res) => {
    const raw = body(req);
    const b = validate(raw, { to_status: ['PLANNED', 'PACKED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'], changed_at: 'ts?', changed_by: 'string?', departure_time: 'ts?', arrival_time: 'ts?' });
    res.json(tx(db, () => {
      const s = shipmentOr404(db, req.params.id);
      if (!STATUS_FLOW[s.shipment_status].includes(b.to_status)) throw conflict(`${s.shipment_status} -> ${b.to_status} is not allowed`, 'INVALID_TRANSITION');
      const at = b.changed_at ?? nowIso();
      let dep = s.departure_time, arr = s.arrival_time;
      if (b.to_status === 'IN_TRANSIT') dep = b.departure_time ?? at;
      if (b.to_status === 'DELIVERED') arr = b.arrival_time ?? at;
      run(db, 'UPDATE shipment SET shipment_status = ?, departure_time = ?, arrival_time = ? WHERE shipment_id = ?', b.to_status, dep, arr, s.shipment_id);
      run(db, 'INSERT INTO shipment_status_history VALUES (?, ?, ?, ?, ?, ?)', ids.historyId(nextId(db, 'shipment_status_history', 'history_id', 'HST-2026-')), s.shipment_id, s.shipment_status, b.to_status, at, b.changed_by ?? 'api');
      return { shipment_id: s.shipment_id, from_status: s.shipment_status, shipment_status: b.to_status, departure_time: dep, arrival_time: arr };
    }));
  }));

  // ---- readings ingestion ----------------------------------------------------------------------------------
  r.post('/readings/batch', requires('readings:ingest'), wrap((req, res) => {
    const b = body(req);
    need(Array.isArray(b.readings), 'readings must be an array');
    const loggers = new Map(), assigns = new Map();
    const loggerInfo = (id) => {
      if (!loggers.has(id)) loggers.set(id, get(db, 'SELECT logger_id, calibration_uncertainty_c u FROM logger WHERE logger_id = ?', id) ?? null);
      return loggers.get(id);
    };
    const assignsOf = (id) => {
      if (!assigns.has(id)) assigns.set(id, all(db, "SELECT logger_assignment_id id, assigned_from f, assigned_to t FROM logger_assignment WHERE logger_id = ? AND assignment_status != 'CANCELLED'", id));
      return assigns.get(id);
    };
    const ins = db.prepare('INSERT OR IGNORE INTO temperature_reading (reading_id, logger_id, logger_assignment_id, recorded_at, received_at, temperature_c, calibration_uncertainty_c, reading_quality) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const result = { accepted: 0, duplicates: 0, rejected: [] };
    tx(db, () => {
      b.readings.forEach((x, i) => {
        const reject = (reason) => result.rejected.push({ index: i, reason });
        if (!x || typeof x !== 'object' || Array.isArray(x)) return reject('reading must be an object');
        if (typeof x.logger_id !== 'string') return reject('logger_id is required');
        const lg = loggerInfo(x.logger_id);
        if (!lg) return reject('logger does not exist');
        if (typeof x.recorded_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(x.recorded_at) || Number.isNaN(ms(x.recorded_at))) return reject('recorded_at must be an ISO UTC timestamp');
        const t = ms(x.recorded_at);
        if (t % (10 * MIN) !== 0) return reject('recorded_at is not on the 10-minute grid');
        if (typeof x.temperature_c !== 'number' || !Number.isFinite(x.temperature_c)) return reject('temperature_c must be a number');
        if (x.temperature_c < -80 || x.temperature_c > 60) return reject('temperature_c out of range (-80..60)');
        const q = x.reading_quality ?? 'GOOD';
        if (!QUALITY.includes(q)) return reject(`reading_quality must be one of ${QUALITY.join(', ')}`);
        const u = x.calibration_uncertainty_c ?? lg.u ?? 0;
        if (typeof u !== 'number' || !(u >= 0)) return reject('calibration_uncertainty_c must be a number >= 0');
        const recv = x.received_at ?? x.recorded_at;
        if (typeof recv !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(recv) || Number.isNaN(ms(recv))) return reject('received_at must be an ISO UTC timestamp');
        if (recv < x.recorded_at) return reject('received_at is before recorded_at');
        const rid = ids.readingId(x.logger_id, t);
        if (x.reading_id !== undefined && x.reading_id !== rid) return reject('reading_id does not match logger_id and recorded_at');
        let aid = x.logger_assignment_id ?? null;
        if (aid !== null) { if (!assignsOf(x.logger_id).some((a) => a.id === aid)) return reject('logger_assignment_id does not exist for this logger'); }
        else aid = assignsOf(x.logger_id).find((a) => a.f <= x.recorded_at && (a.t === null || a.t >= x.recorded_at))?.id ?? null;
        const info = ins.run(rid, x.logger_id, aid, x.recorded_at, recv, Math.round(x.temperature_c * 100) / 100, u, q);
        if (info.changes === 0) result.duplicates++; else result.accepted++;
      });
    });
    res.json(result);
  }));

  // ---- evaluation ------------------------------------------------------------------------------------------
  r.post('/shipments/:id/evaluate', requires('shipments:evaluate'), wrap((req, res) => {
    const raw = body(req);
    const asOfIn = validate(raw, { asOf: 'ts?' }).asOf;
    const sid = req.params.id;
    const out = tx(db, () => {
      const slice = loadSlice(db, sid);
      if (!slice) throw notFound(`shipment ${sid} not found`);
      const s = slice.tables.shipment[0];
      if (s.shipment_status !== 'DELIVERED' || !s.departure_time || !s.arrival_time) throw conflict('only DELIVERED shipments with departure and arrival times are evaluated', 'NOT_EVALUATABLE');
      // default as-of: the data cut-off already used for this shipment, advanced by anything received later inside the transit
      const lastRun = get(db, 'SELECT max(run_at) m FROM compliance_run WHERE shipment_id = ?', sid).m;
      const lastRecv = get(db, `SELECT max(received_at) m FROM temperature_reading WHERE recorded_at BETWEEN ? AND ? AND logger_id IN (SELECT logger_id FROM logger_assignment WHERE shipment_id = ?)`, s.departure_time, s.arrival_time, sid).m;
      const asOf = asOfIn ?? [lastRun, lastRecv, s.arrival_time].filter(Boolean).sort().at(-1);
      const idx = buildIndexes(slice.tables, { readingStore: slice.readingStore });
      const draft = evaluateShipment(idx, s, { asOf });
      const same = get(db, 'SELECT * FROM compliance_run WHERE shipment_id = ? AND input_fingerprint = ?', sid, draft.fingerprint);
      if (same) return { created: false, run: { ...same, is_current: same.is_current === 1 }, exceptions: { created: 0, unchanged: 0, stale: 0 } };

      const m = materialize(draft, nextId(db, 'compliance_run', 'compliance_run_id', 'RUN-2026-'), nextId(db, 'excursion_report', 'excursion_id', 'EXCR-2026-'));
      run(db, 'UPDATE compliance_run SET is_current = 0 WHERE shipment_id = ?', sid);
      const R = m.run;
      run(db, 'INSERT INTO compliance_run VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', R.compliance_run_id, R.shipment_id, R.policy_id, R.policy_version, R.policy_min_temp_c, R.policy_max_temp_c, R.policy_max_excursion_minutes, R.policy_max_data_gap_minutes, R.compliance_status, R.reason_summary, R.engine_version, R.input_fingerprint, R.run_at, 1);
      for (const f of m.findings) run(db, 'INSERT INTO compliance_finding VALUES (?, ?, ?, ?, ?, ?)', f.finding_id, f.compliance_run_id, f.rule_code, f.result, f.detail, f.detail_json);
      for (const e of m.evidence) run(db, 'INSERT OR IGNORE INTO compliance_evidence VALUES (?, ?)', e.finding_id, e.reading_id);

      const existing = all(db, "SELECT * FROM excursion_report WHERE shipment_id = ? AND source = 'ENGINE'", sid)
        .map((e) => ({ exception: e, history: all(db, 'SELECT * FROM exception_event WHERE excursion_id = ? ORDER BY occurred_at, exception_event_id', e.excursion_id) }));
      const rec = reconcileExceptions(existing, m.excursions, { runId: R.compliance_run_id, occurredAt: asOf });
      const evBy = new Map();
      for (const x of m.excursionEvidence) { if (!evBy.has(x.excursion_id)) evBy.set(x.excursion_id, []); evBy.get(x.excursion_id).push(x.reading_id); }
      for (const e of rec.toCreate) {
        run(db, 'INSERT INTO excursion_report VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', e.excursion_id, e.shipment_id, e.logger_id, e.logger_assignment_id, e.policy_id, e.compliance_run_id, e.source, e.issue_type, e.start_time, e.end_time, e.duration_minutes, e.peak_temperature_c, e.severity, e.status, e.detected_at, e.assigned_analyst, e.resolution, e.resolved_at, e.evidence_reference);
        for (const rid of evBy.get(e.excursion_id) ?? []) run(db, 'INSERT OR IGNORE INTO excursion_evidence VALUES (?, ?)', e.excursion_id, rid);
      }
      for (const st of rec.stale) {
        const note = st.history.at(-1);
        if (note && /^NOTE-/.test(note.exception_event_id)) run(db, 'INSERT OR IGNORE INTO exception_event VALUES (?, ?, ?, ?, ?, ?, ?)', note.exception_event_id, note.excursion_id, note.from_status, note.to_status, note.analyst, note.note, note.occurred_at);
      }
      return { created: true, run: R, exceptions: { created: rec.toCreate.length, unchanged: rec.unchanged.length, stale: rec.stale.length } };
    });
    res.status(out.created ? 201 : 200).json(out);
  }));

  // ---- exception workflow ----------------------------------------------------------------------------------
  r.post('/exceptions/:id/transition', wrap((req, res) => {
    const role = roleOf(req);
    const raw = body(req);
    const b = validate(raw, { event_id: 'string', to_status: ['OPEN', 'ASSIGNED', 'INVESTIGATING', 'RESOLVED', 'ESCALATED'], analyst: 'string?', note: 'string?', resolution: 'string?', occurred_at: 'ts?' });
    const perm = b.to_status === 'RESOLVED' || b.to_status === 'ESCALATED' ? 'exceptions:decide' : 'exceptions:transition';
    if (!can(role, perm)) throw forbidden(`role ${role} is not allowed to move an exception to ${b.to_status}`);
    const out = tx(db, () => {
      const e = get(db, 'SELECT * FROM excursion_report WHERE excursion_id = ?', req.params.id);
      if (!e) throw notFound(`exception ${req.params.id} not found`);
      const history = all(db, 'SELECT * FROM exception_event WHERE excursion_id = ? ORDER BY occurred_at, exception_event_id', e.excursion_id);
      let result;
      try {
        result = applyTransition(e, history, { event_id: b.event_id, to_status: b.to_status, analyst: b.analyst ?? undefined, note: b.note ?? undefined, resolution: b.resolution ?? undefined, occurred_at: b.occurred_at ?? nowIso() });
      } catch (err) {
        if (err instanceof ExceptionError) throw new HttpError(err.code === 'INVALID_TRANSITION' ? 409 : 400, err.code === 'INVALID_TRANSITION' ? 'INVALID_TRANSITION' : 'VALIDATION_ERROR', err.message);
        throw err;
      }
      if (result.history.length !== history.length) {
        const h = result.history.at(-1), x = result.exception;
        run(db, 'INSERT INTO exception_event VALUES (?, ?, ?, ?, ?, ?, ?)', h.exception_event_id, h.excursion_id, h.from_status, h.to_status, h.analyst, h.note, h.occurred_at);
        run(db, 'UPDATE excursion_report SET status = ?, assigned_analyst = ?, resolution = ?, resolved_at = ? WHERE excursion_id = ?', x.status, x.assigned_analyst ?? null, x.resolution ?? null, x.resolved_at ?? null, e.excursion_id);
      }
      return { exception: result.exception, history: result.history, duplicate: result.history.length === history.length };
    });
    res.json(out);
  }));
  return r;
}
void iso;
