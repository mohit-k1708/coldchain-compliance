import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTransition, reconcileExceptions, ExceptionError, STATES } from '../../engine/exceptions.js';

const base = () => ({ excursion_id: 'EXCR-2026-000001', shipment_id: 'SHP-2026-000001', issue_type: 'TEMP_HIGH', start_time: '2026-03-10T10:20:00Z', status: 'OPEN', assigned_analyst: null, resolution: null, resolved_at: null });
const ev = (id, to, extra = {}) => ({ event_id: id, to_status: to, occurred_at: `2026-03-11T0${id.slice(-1)}:00:00Z`, ...extra });
const step = (s, e) => applyTransition(s.exception, s.history, e);
const throwsCode = (fn, code) => assert.throws(fn, (err) => err instanceof ExceptionError && err.code === code);

test('full valid path OPEN -> ASSIGNED -> INVESTIGATING -> RESOLVED', () => {
  let s = { exception: base(), history: [] };
  s = step(s, ev('E1', 'ASSIGNED', { analyst: 'alice' }));
  s = step(s, ev('E2', 'INVESTIGATING'));
  s = step(s, ev('E3', 'RESOLVED', { resolution: 'logger re-read, within allowance' }));
  assert.equal(s.exception.status, 'RESOLVED');
  assert.equal(s.exception.assigned_analyst, 'alice');
  assert.equal(s.exception.resolution, 'logger re-read, within allowance');
  assert.equal(s.exception.resolved_at, '2026-03-11T03:00:00Z');
  assert.deepEqual(s.history.map((h) => [h.from_status, h.to_status]), [['OPEN', 'ASSIGNED'], ['ASSIGNED', 'INVESTIGATING'], ['INVESTIGATING', 'RESOLVED']]);
});

test('escalate then resolve; escalate then back to investigating', () => {
  let s = { exception: base(), history: [] };
  s = step(s, ev('E1', 'ASSIGNED', { analyst: 'bob' }));
  s = step(s, ev('E2', 'INVESTIGATING'));
  s = step(s, ev('E3', 'ESCALATED', { note: 'needs QA sign-off' }));
  assert.equal(s.exception.status, 'ESCALATED');
  const back = step(s, ev('E4', 'INVESTIGATING'));
  assert.equal(back.exception.status, 'INVESTIGATING');
  s = step(s, ev('E5', 'RESOLVED', { resolution: 'QA accepted' }));
  assert.equal(s.exception.status, 'RESOLVED');
  assert.equal(s.history.length, 4);
});

test('every invalid transition is rejected', () => {
  const allowed = { OPEN: ['ASSIGNED'], ASSIGNED: ['INVESTIGATING'], INVESTIGATING: ['RESOLVED', 'ESCALATED'], ESCALATED: ['INVESTIGATING', 'RESOLVED'], RESOLVED: [] };
  const full = { analyst: 'a', note: 'n', resolution: 'r' };
  let tested = 0;
  for (const from of STATES) for (const to of STATES) {
    if (allowed[from].includes(to)) continue;
    throwsCode(() => applyTransition({ ...base(), status: from }, [], ev('E1', to, full)), 'INVALID_TRANSITION');
    tested++;
  }
  assert.equal(tested, 25 - 6);
  throwsCode(() => applyTransition(base(), [], ev('E1', 'CLOSED', full)), 'UNKNOWN_STATUS');
});

test('missing required fields are rejected', () => {
  throwsCode(() => applyTransition(base(), [], ev('E1', 'ASSIGNED')), 'MISSING_FIELD'); // analyst
  throwsCode(() => applyTransition(base(), [], ev('E1', 'ASSIGNED', { analyst: '  ' })), 'MISSING_FIELD');
  throwsCode(() => applyTransition({ ...base(), status: 'INVESTIGATING' }, [], ev('E1', 'RESOLVED')), 'MISSING_FIELD'); // resolution
  throwsCode(() => applyTransition({ ...base(), status: 'INVESTIGATING' }, [], ev('E1', 'ESCALATED')), 'MISSING_FIELD'); // note
  throwsCode(() => applyTransition({ ...base(), status: 'INVESTIGATING' }, [], { event_id: 'E1', to_status: 'RESOLVED', resolution: 'ok' }), 'MISSING_FIELD'); // resolved_at (occurred_at)
  throwsCode(() => applyTransition(base(), [], { to_status: 'ASSIGNED', analyst: 'a', occurred_at: 'x' }), 'MISSING_FIELD'); // event_id
});

test('history is append-only and old events are never mutated; duplicate event_id is a no-op', () => {
  let s = { exception: base(), history: [] };
  s = step(s, ev('E1', 'ASSIGNED', { analyst: 'alice' }));
  const first = s.history[0], snapshot = structuredClone(first), historyRef = s.history, excRef = s.exception;
  const s2 = step(s, ev('E2', 'INVESTIGATING'));
  assert.equal(s2.history.length, 2);
  assert.deepEqual(s2.history[0], snapshot);
  assert.equal(s2.history[0], first); // same object, untouched
  assert.equal(historyRef.length, 1); // the input array was not mutated
  assert.equal(excRef.status, 'ASSIGNED'); // nor the input exception
  assert.throws(() => { 'use strict'; first.to_status = 'RESOLVED'; }, TypeError); // entries are frozen
  const again = step(s2, ev('E2', 'INVESTIGATING'));
  assert.equal(again.exception, s2.exception);
  assert.equal(again.history, s2.history); // exact no-op
  const dupOfOld = step(s2, ev('E1', 'ASSIGNED', { analyst: 'someone else' }));
  assert.equal(dupOfOld.history.length, 2);
  assert.equal(dupOfOld.exception.assigned_analyst, 'alice');
});

test('reconcileExceptions: dedupe, unchanged, stale', () => {
  const mk = (id, type, start, status = 'OPEN') => ({ exception: { ...base(), excursion_id: id, issue_type: type, start_time: start, status }, history: [] });
  const existing = [mk('X1', 'TEMP_HIGH', 'T1', 'INVESTIGATING'), mk('X2', 'MISSING_DATA', 'T2'), mk('X3', 'CUSTODY_GAP', null)];
  const det = (type, start) => ({ shipment_id: 'SHP-2026-000001', issue_type: type, start_time: start });
  const detected = [det('TEMP_HIGH', 'T1'), det('TEMP_HIGH', 'T1'), det('TEMP_LOW', 'T9'), det('CUSTODY_GAP', null)];
  const r = reconcileExceptions(existing, detected, { runId: 'RUN-2026-000009', occurredAt: '2026-11-01T00:00:00Z' });
  assert.deepEqual(r.toCreate.map((x) => x.issue_type + x.start_time), ['TEMP_LOWT9']); // new condition only; duplicate detection ignored
  assert.deepEqual(r.unchanged.map((e) => e.exception.excursion_id), ['X1', 'X3']);
  assert.equal(r.unchanged[0].exception.status, 'INVESTIGATING'); // status kept on re-run
  assert.equal(r.stale.length, 1);
  assert.equal(r.stale[0].exception.excursion_id, 'X2');
  assert.equal(r.stale[0].exception.status, 'OPEN'); // status NOT changed
  assert.equal(r.stale[0].history.length, 1);
  assert.equal(r.stale[0].history[0].note, 'condition not detected in run RUN-2026-000009');
  assert.equal(existing[1].history.length, 0); // input untouched
  // re-running reconcile with the stale result does not append the note twice
  const r2 = reconcileExceptions([r.stale[0]], [], { runId: 'RUN-2026-000009' });
  assert.equal(r2.stale[0].history.length, 1);
  // nothing detected, nothing existing
  assert.deepEqual(reconcileExceptions([], [], { runId: 'R' }), { toCreate: [], unchanged: [], stale: [] });
});
