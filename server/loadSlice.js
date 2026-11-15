// Loads ONE shipment's rows (plus the masters the engine needs) from SQLite into the plain-table shape the engine expects,
// with a small in-memory ReadingStore of the shipment's logger readings. The engine and report code are reused unchanged.
import { all, get } from './db.js';
import { ReadingStore } from '../engine/readingStore.js';
import { ms, DAY, iso } from '../engine/time.js';

const bools = (rows) => rows.map((r) => ('is_current' in r ? { ...r, is_current: r.is_current === 1 } : r));

export function loadSlice(db, shipmentId) {
  const shipment = get(db, 'SELECT * FROM shipment WHERE shipment_id = ?', shipmentId);
  if (!shipment) return null;
  const sid = shipmentId;
  const t = {};
  t.shipment = [shipment];
  t.product = all(db, 'SELECT * FROM product WHERE product_id = ?', shipment.product_id);
  t.shipment_lot = all(db, 'SELECT * FROM shipment_lot WHERE shipment_id = ?', sid);
  t.lot = all(db, 'SELECT l.* FROM lot l WHERE l.lot_id IN (SELECT lot_id FROM shipment_lot WHERE shipment_id = ?)', sid);
  t.shipment_packaging = all(db, 'SELECT * FROM shipment_packaging WHERE shipment_id = ?', sid);
  t.packaging = all(db, 'SELECT p.* FROM packaging p WHERE p.packaging_id IN (SELECT packaging_id FROM shipment_packaging WHERE shipment_id = ?)', sid);
  t.logger_assignment = all(db, 'SELECT * FROM logger_assignment WHERE logger_id IN (SELECT logger_id FROM logger_assignment WHERE shipment_id = ?)', sid); // incl. other shipments' (overlap check)
  t.logger = all(db, 'SELECT * FROM logger WHERE logger_id IN (SELECT logger_id FROM logger_assignment WHERE shipment_id = ?)', sid);
  t.logger_calibration = all(db, 'SELECT * FROM logger_calibration WHERE logger_id IN (SELECT logger_id FROM logger_assignment WHERE shipment_id = ?)', sid);
  t.threshold_policy = all(db, 'SELECT * FROM threshold_policy WHERE product_id = ? OR policy_id = ?', shipment.product_id, shipment.policy_id);
  t.route_stop = all(db, 'SELECT * FROM route_stop WHERE shipment_id = ?', sid);
  t.custody_event = all(db, 'SELECT * FROM custody_event WHERE shipment_id = ?', sid);
  t.legacy_report = all(db, 'SELECT * FROM legacy_report WHERE shipment_id = ?', sid);
  t.excursion_report = all(db, 'SELECT * FROM excursion_report WHERE shipment_id = ?', sid);
  t.exception_event = all(db, 'SELECT e.* FROM exception_event e WHERE e.excursion_id IN (SELECT excursion_id FROM excursion_report WHERE shipment_id = ?)', sid);
  t.compliance_run = bools(all(db, 'SELECT * FROM compliance_run WHERE shipment_id = ?', sid));
  t.party = all(db, 'SELECT * FROM party');
  t.temperature_reading = []; // readings come from the store

  // readings of the assigned loggers around the transit window (bounded: a logger's readings for ~2 days + the transit)
  const loggers = t.logger.map((l) => l.logger_id);
  let rows = [];
  if (loggers.length && shipment.departure_time && shipment.arrival_time) {
    const from = iso(ms(shipment.departure_time) - DAY), to = iso(ms(shipment.arrival_time) + DAY);
    for (const lg of loggers) {
      rows = rows.concat(all(db, 'SELECT * FROM temperature_reading WHERE logger_id = ? AND recorded_at BETWEEN ? AND ?', lg, from, to));
    }
  }
  const readingStore = ReadingStore.fromRows(rows);
  const maxReceived = rows.reduce((m, r) => (r.received_at > m ? r.received_at : m), '');
  return { tables: t, readingStore, maxReceived };
}
