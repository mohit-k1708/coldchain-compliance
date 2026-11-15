import { ms, MIN } from '../time.js';

const F = (rule_code, result, detail, extra = {}) => ({ rule_code, result, detail, detail_json: extra.json ?? {}, reading_ids: [],
  ...(result === 'PASS' ? {} : { issue_type: 'ROUTE_DEVIATION' }) });

// R-ROUTE-01..05
export function evaluateRoute(stops, policy) {
  const planned = stops.filter((s) => s.planned_arrival !== null && s.planned_arrival !== undefined);
  const actual = stops.filter((s) => s.actual_arrival !== null && s.actual_arrival !== undefined);
  if (actual.length === 0) {
    return [F('R-ROUTE-05', 'INDETERMINATE', 'delivered shipment has no actual route stops (missing route evidence)')];
  }
  const f = [F('R-ROUTE-05', 'PASS', `${actual.length} actual stop(s) recorded`)];
  const missing = planned.filter((s) => s.actual_arrival === null || s.actual_arrival === undefined);
  f.push(missing.length ? F('R-ROUTE-01', 'FAIL', `MISSING_STOP: planned stop(s) never reached: ${missing.map((s) => `${s.location} (${s.route_stop_id})`).join(', ')}`, { json: { stops: missing.map((s) => s.route_stop_id) } })
    : F('R-ROUTE-01', 'PASS', 'every planned stop was reached'));
  const extra = actual.filter((s) => s.planned_arrival === null || s.planned_arrival === undefined);
  f.push(extra.length ? F('R-ROUTE-02', 'FAIL', `UNEXPECTED_STOP: unplanned stop(s): ${extra.map((s) => `${s.location} (${s.route_stop_id})`).join(', ')}`, { json: { stops: extra.map((s) => s.route_stop_id) } })
    : F('R-ROUTE-02', 'PASS', 'no unplanned stops'));
  const both = planned.filter((s) => s.actual_arrival !== null && s.actual_arrival !== undefined);
  const plannedOrder = [...both].sort((a, b) => (a.stop_sequence ?? ms(a.planned_arrival)) - (b.stop_sequence ?? ms(b.planned_arrival)));
  const actualKey = (s) => (s.actual_sequence ?? ms(s.actual_arrival));
  const actualOrder = [...both].sort((a, b) => actualKey(a) - actualKey(b));
  const same = plannedOrder.every((s, i) => s.route_stop_id === actualOrder[i].route_stop_id);
  f.push(same ? F('R-ROUTE-03', 'PASS', 'actual stop order equals planned order')
    : F('R-ROUTE-03', 'FAIL', `SEQUENCE: planned order ${plannedOrder.map((s) => s.location).join(' > ')} but actual order ${actualOrder.map((s) => s.location).join(' > ')}`,
      { json: { planned: plannedOrder.map((s) => s.route_stop_id), actual: actualOrder.map((s) => s.route_stop_id) } }));
  const over = actual.filter((s) => s.actual_departure && (ms(s.actual_departure) - ms(s.actual_arrival)) / MIN > policy.max_dwell_minutes);
  f.push(over.length ? F('R-ROUTE-04', 'FAIL', `EXCESS_DWELL: ${over.map((s) => `${s.location} dwell ${(ms(s.actual_departure) - ms(s.actual_arrival)) / MIN} min`).join(', ')} exceeds allowed ${policy.max_dwell_minutes} min`, { json: { stops: over.map((s) => s.route_stop_id) } })
    : F('R-ROUTE-04', 'PASS', `all dwell times within ${policy.max_dwell_minutes} min`));
  return f;
}
