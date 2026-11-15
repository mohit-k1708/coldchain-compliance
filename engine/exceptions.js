// Exception workflow: pure functions, no DB. History is append-only; original events are never mutated.
export const STATES = ['OPEN', 'ASSIGNED', 'INVESTIGATING', 'RESOLVED', 'ESCALATED'];
export const ALLOWED = {
  OPEN: ['ASSIGNED'], ASSIGNED: ['INVESTIGATING'], INVESTIGATING: ['RESOLVED', 'ESCALATED'],
  ESCALATED: ['INVESTIGATING', 'RESOLVED'], RESOLVED: [],
};

export class ExceptionError extends Error {
  constructor(code, message) { super(message); this.name = 'ExceptionError'; this.code = code; }
}

const blank = (v) => v === undefined || v === null || String(v).trim() === '';

// exception: an excursion_report-like row {excursion_id, shipment_id, issue_type, start_time, status, assigned_analyst, resolution, resolved_at}
// history: array of exception_event-like rows. event: {event_id, to_status, analyst?, note?, resolution?, occurred_at}
export function applyTransition(exception, history, event) {
  if (blank(event.event_id)) throw new ExceptionError('MISSING_FIELD', 'event_id is required');
  if (history.some((h) => h.exception_event_id === event.event_id)) return { exception, history }; // idempotent no-op
  if (!STATES.includes(event.to_status)) throw new ExceptionError('UNKNOWN_STATUS', `unknown status ${event.to_status}`);
  if (!(ALLOWED[exception.status] ?? []).includes(event.to_status)) {
    throw new ExceptionError('INVALID_TRANSITION', `${exception.status} -> ${event.to_status} is not allowed`);
  }
  if (blank(event.occurred_at)) throw new ExceptionError('MISSING_FIELD', 'occurred_at is required');
  if (event.to_status === 'ASSIGNED' && blank(event.analyst)) throw new ExceptionError('MISSING_FIELD', 'ASSIGNED requires an analyst');
  if (event.to_status === 'RESOLVED' && blank(event.resolution)) throw new ExceptionError('MISSING_FIELD', 'RESOLVED requires resolution text');
  if (event.to_status === 'ESCALATED' && blank(event.note)) throw new ExceptionError('MISSING_FIELD', 'ESCALATED requires a note');

  const next = { ...exception, status: event.to_status };
  if (!blank(event.analyst)) next.assigned_analyst = event.analyst;
  if (event.to_status === 'RESOLVED') { next.resolution = event.resolution; next.resolved_at = event.occurred_at; }
  const entry = Object.freeze({
    exception_event_id: event.event_id, excursion_id: exception.excursion_id, from_status: exception.status, to_status: event.to_status,
    analyst: blank(event.analyst) ? null : event.analyst, note: blank(event.note) ? null : event.note, occurred_at: event.occurred_at,
  });
  return { exception: next, history: [...history, entry] };
}

export const dedupeKey = (x) => `${x.shipment_id}|${x.issue_type}|${x.start_time ?? ''}`;

// existing: [{exception, history}]; detected: engine excursion rows. Existing exceptions keep their status on re-runs.
// stale = existing no longer detected: a history note is appended, status is NOT changed.
export function reconcileExceptions(existing, detected, { runId, occurredAt = null } = {}) {
  const seen = new Map();
  for (const e of existing) if (!seen.has(dedupeKey(e.exception))) seen.set(dedupeKey(e.exception), e);
  const detectedKeys = new Set();
  const toCreate = [], unchanged = [];
  for (const d of detected) {
    const k = dedupeKey(d);
    if (detectedKeys.has(k)) continue; // duplicate detection inside one run
    detectedKeys.add(k);
    if (seen.has(k)) unchanged.push(seen.get(k));
    else toCreate.push(d);
  }
  const stale = [];
  for (const [k, e] of seen) {
    if (detectedKeys.has(k)) continue;
    const id = `NOTE-${runId}-${e.exception.excursion_id}`;
    if (e.history.some((h) => h.exception_event_id === id)) { stale.push(e); continue; }
    const note = Object.freeze({ exception_event_id: id, excursion_id: e.exception.excursion_id, from_status: e.exception.status,
      to_status: e.exception.status, analyst: null, note: `condition not detected in run ${runId}`, occurred_at: occurredAt });
    stale.push({ exception: e.exception, history: [...e.history, note] });
  }
  return { toCreate, unchanged, stale };
}
