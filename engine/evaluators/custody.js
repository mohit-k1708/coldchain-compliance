import { ms } from '../time.js';

// R-CUS-01 / R-CUS-02. Exact duplicate events are removed first (reported as WARNING), then the chain is checked.
export function evaluateCustody(events, shipment) {
  const seen = new Set();
  const dups = [];
  const evs = [...events].sort((a, b) => a.event_sequence - b.event_sequence).filter((e) => {
    const k = [e.event_type, e.from_party_id, e.to_party_id, e.event_timestamp].join('|');
    if (seen.has(k)) { dups.push(e.custody_event_id); return false; }
    seen.add(k);
    return true;
  });
  const problems = [];
  if (!evs.length) problems.push('no custody events recorded');
  else {
    if (evs[0].event_type !== 'PICKUP') problems.push('chain does not start with PICKUP');
    else if (evs[0].from_party_id !== shipment.origin_party_id) problems.push(`PICKUP from ${evs[0].from_party_id}, expected origin ${shipment.origin_party_id}`);
    if (evs.at(-1).event_type !== 'DELIVERY') problems.push('chain does not end with DELIVERY');
    else if (evs.at(-1).to_party_id !== shipment.destination_party_id) problems.push(`DELIVERY to ${evs.at(-1).to_party_id}, expected destination ${shipment.destination_party_id}`);
    evs.forEach((e, i) => {
      if (!e.from_party_id || !e.to_party_id) problems.push(`event ${e.event_sequence} has a null party`);
      if (i > 0) {
        if (evs[i - 1].to_party_id !== e.from_party_id) problems.push(`break: event ${evs[i - 1].event_sequence} hands to ${evs[i - 1].to_party_id} but event ${e.event_sequence} is from ${e.from_party_id}`);
      }
    });
  }
  const f1 = { rule_code: 'R-CUS-01', result: problems.length ? 'INDETERMINATE' : 'PASS',
    detail: problems.length ? `custody gap: ${problems.join('; ')}` : `custody chain continuous over ${evs.length} events (PICKUP to DELIVERY)`,
    detail_json: { events: evs.length, problems }, reading_ids: [], ...(problems.length ? { issue_type: 'CUSTODY_GAP' } : {}) };

  const order = [];
  evs.forEach((e, i) => {
    if (i > 0 && ms(e.event_timestamp) < ms(evs[i - 1].event_timestamp)) order.push(`event ${e.event_sequence} is earlier than event ${evs[i - 1].event_sequence}`);
    if (ms(e.recorded_at) < ms(e.event_timestamp)) order.push(`event ${e.event_sequence} recorded before it happened`);
  });
  const pk = evs.find((e) => e.event_type === 'PICKUP'), dl = evs.find((e) => e.event_type === 'DELIVERY');
  if (pk && dl && ms(dl.event_timestamp) < ms(pk.event_timestamp)) order.push('DELIVERY is before PICKUP');
  const f2 = order.length
    ? { rule_code: 'R-CUS-02', result: 'INDETERMINATE', detail: `custody timestamps inconsistent: ${order.join('; ')}`, detail_json: { problems: order }, reading_ids: [], issue_type: 'CUSTODY_GAP' }
    : dups.length
      ? { rule_code: 'R-CUS-02', result: 'WARNING', detail: `duplicate custody event(s) ignored: ${dups.join(', ')}`, detail_json: { duplicates: dups }, reading_ids: [] }
      : { rule_code: 'R-CUS-02', result: 'PASS', detail: 'custody timestamps ordered and recorded after the events', detail_json: {}, reading_ids: [] };
  return [f1, f2];
}
