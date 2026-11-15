// A deliberately naive checker (NOT part of engine/): what the five mandatory failure modes describe.
// - readings are taken per LOGGER stream, so adjacent shipments of one logger merge into one run
// - compared with the PRODUCT's own required range (no uncertainty, no policy versioning)
// - data gaps, calibration, custody, route and policy checks are ignored; legacy PASS is trusted (never second-guessed)
// Status = NON_COMPLIANT if merged out-of-range minutes exceed the product's allowance, else COMPLIANT.
import { ms, MIN, DAY } from '../engine/time.js';

// tables: shipment, product, logger_assignment. windowReadings(loggerId, fromMs, toMs) -> [{t, row}]
export function naiveEvaluate(tables, windowReadings) {
  const product = new Map(tables.product.map((p) => [p.product_id, p]));
  const asg = new Map();
  for (const a of tables.logger_assignment) if (!asg.has(a.shipment_id)) asg.set(a.shipment_id, a);
  const out = new Map();
  for (const s of tables.shipment.filter((x) => x.shipment_status === 'DELIVERED')) {
    const p = product.get(s.product_id);
    const a = asg.get(s.shipment_id);
    const dep = ms(s.departure_time), arr = ms(s.arrival_time);
    let minutes = 0;
    if (a) { // no assignment -> the naive system cannot find the logger -> no readings
      const stream = windowReadings(a.logger_id, dep - 7 * DAY, arr + 7 * DAY);
      const isOut = (r) => r.row.temperature_c < p.required_min_temp_c || r.row.temperature_c > p.required_max_temp_c;
      for (let i = 0; i < stream.length;) {
        if (!isOut(stream[i])) { i++; continue; }
        let j = i;
        while (j + 1 < stream.length && isOut(stream[j + 1])) j++; // consecutive readings, spacing ignored
        const start = stream[i].t, end = stream[j + 1] ? stream[j + 1].t : stream[j].t + 10 * MIN;
        if (start <= arr && end >= dep) minutes += (end - start) / MIN; // whole merged run, including other shipments' part
        i = j + 1;
      }
    }
    out.set(s.shipment_id, minutes > p.max_excursion_minutes ? 'NON_COMPLIANT' : 'COMPLIANT');
  }
  return out;
}
