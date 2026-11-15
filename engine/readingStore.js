// Memory-light reading access: temperature_reading.csv is streamed once into per-logger typed arrays;
// plain row objects are materialized only for the requested window.
import { streamLines } from '../generator/csvStream.js';
import { readingId } from '../generator/ids.js';
import { iso, ms } from './time.js';

const QUALITY = ['GOOD', 'SUSPECT', 'INVALID'];
const QCODE = new Map(QUALITY.map((q, i) => [q, i]));

class LoggerSeries {
  constructor() { this.n = 0; this.cap = 256; this.rec = new Float64Array(256); this.recv = new Float64Array(256); this.temp = new Float32Array(256); this.unc = new Float32Array(256); this.q = new Uint8Array(256); this.asg = new Int32Array(256); }
  push(rec, recv, temp, unc, q, asg) {
    if (this.n === this.cap) this.grow();
    const i = this.n++;
    this.rec[i] = rec; this.recv[i] = recv; this.temp[i] = temp; this.unc[i] = unc; this.q[i] = q; this.asg[i] = asg;
  }
  grow() {
    this.cap *= 2;
    for (const k of ['rec', 'recv', 'temp', 'unc', 'q', 'asg']) { const a = new this[k].constructor(this.cap); a.set(this[k]); this[k] = a; }
  }
  finalize() {
    for (const k of ['rec', 'recv', 'temp', 'unc', 'q', 'asg']) this[k] = this[k].slice(0, this.n);
    let sorted = true;
    for (let i = 1; i < this.n; i++) if (this.rec[i] < this.rec[i - 1]) { sorted = false; break; }
    if (sorted) return;
    const order = Array.from({ length: this.n }, (_, i) => i).sort((a, b) => this.rec[a] - this.rec[b]);
    for (const k of ['rec', 'recv', 'temp', 'unc', 'q', 'asg']) { const src = this[k], dst = new src.constructor(this.n); order.forEach((o, i) => { dst[i] = src[o]; }); this[k] = dst; }
  }
  lower(x) { let lo = 0, hi = this.n; while (lo < hi) { const m = (lo + hi) >> 1; if (this.rec[m] < x) lo = m + 1; else hi = m; } return lo; }
  upper(x) { let lo = 0, hi = this.n; while (lo < hi) { const m = (lo + hi) >> 1; if (this.rec[m] <= x) lo = m + 1; else hi = m; } return lo; }
}

export class ReadingStore {
  constructor() { this.series = new Map(); this.assignmentIds = []; this.count = 0; }

  static load(file) {
    const store = new ReadingStore();
    const asgIndex = new Map();
    let col = null;
    streamLines(file, (line) => {
      const c = line.split(',');
      if (!col) { col = Object.fromEntries(c.map((h, i) => [h, i])); return; }
      const lg = c[col.logger_id];
      let s = store.series.get(lg);
      if (!s) { s = new LoggerSeries(); store.series.set(lg, s); }
      let a = -1;
      const aid = c[col.logger_assignment_id];
      if (aid !== '') { a = asgIndex.get(aid); if (a === undefined) { a = store.assignmentIds.length; store.assignmentIds.push(aid); asgIndex.set(aid, a); } }
      s.push(ms(c[col.recorded_at]), ms(c[col.received_at]), Number(c[col.temperature_c]), Number(c[col.calibration_uncertainty_c]), QCODE.get(c[col.reading_quality]) ?? 2, a);
      store.count++;
    });
    for (const s of store.series.values()) s.finalize();
    return store;
  }

  // Build a small store from row objects (used by the API for one shipment's logger readings)
  static fromRows(rows) {
    const store = new ReadingStore();
    const asgIndex = new Map();
    for (const r of rows) {
      let s = store.series.get(r.logger_id);
      if (!s) { s = new LoggerSeries(); store.series.set(r.logger_id, s); }
      let a = -1;
      if (r.logger_assignment_id) { a = asgIndex.get(r.logger_assignment_id); if (a === undefined) { a = store.assignmentIds.length; store.assignmentIds.push(r.logger_assignment_id); asgIndex.set(r.logger_assignment_id, a); } }
      s.push(ms(r.recorded_at), ms(r.received_at), r.temperature_c, r.calibration_uncertainty_c, QCODE.get(r.reading_quality) ?? 2, a);
      store.count++;
    }
    for (const s of store.series.values()) s.finalize();
    return store;
  }

  // [{ t, row }] for readings of one logger with from <= recorded_at <= to
  windowReadings(loggerId, fromMs, toMs) {
    const s = this.series.get(loggerId);
    if (!s) return [];
    const out = [];
    for (let i = s.lower(fromMs), end = s.upper(toMs); i < end; i++) {
      const t = s.rec[i];
      out.push({ t, row: {
        reading_id: readingId(loggerId, t), logger_id: loggerId, logger_assignment_id: s.asg[i] < 0 ? null : this.assignmentIds[s.asg[i]],
        recorded_at: iso(t), received_at: iso(s.recv[i]), temperature_c: Math.round(s.temp[i] * 100) / 100,
        calibration_uncertainty_c: Math.round(s.unc[i] * 100) / 100, reading_quality: QUALITY[s.q[i]] } });
    }
    return out;
  }
  getWindow(loggerId, fromMs, toMs) { return this.windowReadings(loggerId, fromMs, toMs).map((x) => x.row); }
}
