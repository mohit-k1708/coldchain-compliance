import { ms, DAY } from '../time.js';

const active = (assignments) => assignments.filter((a) => a.assignment_status !== 'CANCELLED');
const toMs = (a) => (a.assigned_to ? ms(a.assigned_to) : Infinity);

// R-LOG-01 / R-LOG-02
export function validateLoggerAssignment(assignments, loggerById, depMs, arrMs) {
  const act = active(assignments);
  const missingLoggers = act.filter((a) => !loggerById.has(a.logger_id)).map((a) => a.logger_id);
  const covering = act.filter((a) => ms(a.assigned_from) <= depMs && toMs(a) >= arrMs);
  const f1 = { rule_code: 'R-LOG-01', result: missingLoggers.length ? 'INDETERMINATE' : 'PASS',
    detail: missingLoggers.length ? `assigned logger(s) ${missingLoggers.join(', ')} do not exist` : 'all assigned loggers exist',
    detail_json: { missing_loggers: missingLoggers }, reading_ids: [],
    ...(missingLoggers.length ? { issue_type: 'LOGGER_NOT_ASSIGNED' } : {}) };
  const ok = covering.length > 0;
  const f2 = {
    rule_code: 'R-LOG-02', result: ok ? 'PASS' : 'INDETERMINATE',
    detail: ok ? `logger ${covering[0].logger_id} assignment ${covering[0].logger_assignment_id} covers the whole transit`
      : act.length === 0 ? 'no logger assignment exists for this shipment; readings are not trusted'
        : `no assignment covers departure to arrival (${act.map((a) => `${a.logger_assignment_id} ${a.assigned_from}..${a.assigned_to}`).join('; ')}); readings are not trusted`,
    detail_json: { assignments: act.map((a) => a.logger_assignment_id), covering: covering.map((a) => a.logger_assignment_id) },
    reading_ids: [], ...(ok ? {} : { issue_type: 'LOGGER_NOT_ASSIGNED' }),
  };
  return [f1, f2];
}

// R-LOG-03: one calibration must cover both the departure and arrival dates.
export function validateCalibration(assignments, calibrationsByLogger, depMs, arrMs) {
  const loggers = [...new Set(active(assignments).map((a) => a.logger_id))].sort();
  if (!loggers.length) return null;
  const bad = [];
  for (const lg of loggers) {
    const ok = (calibrationsByLogger.get(lg) ?? []).some((c) => ms(c.calibrated_on) <= depMs && arrMs < ms(c.expires_on) + DAY);
    if (!ok) bad.push(lg);
  }
  return {
    rule_code: 'R-LOG-03', result: bad.length ? 'INDETERMINATE' : 'PASS',
    detail: bad.length ? `logger ${bad.join(', ')} has no calibration valid from departure through arrival`
      : `calibration valid for ${loggers.join(', ')} from departure through arrival`,
    detail_json: { loggers, invalid_loggers: bad }, reading_ids: [],
    ...(bad.length ? { issue_type: 'CALIBRATION_INVALID' } : {}),
  };
}

// R-LOG-04: another assignment of the same logger overlapping this shipment's assignment inside [dep, arr]
export function detectOverlap(assignments, assignmentsByLogger, depMs, arrMs) {
  const mine = active(assignments);
  const pairs = [];
  for (const a of mine) {
    for (const o of active(assignmentsByLogger.get(a.logger_id) ?? [])) {
      if (o.logger_assignment_id === a.logger_assignment_id) continue;
      const s = Math.max(ms(a.assigned_from), ms(o.assigned_from), depMs), e = Math.min(toMs(a), toMs(o), arrMs);
      if (s < e) pairs.push([a.logger_assignment_id, o.logger_assignment_id]);
    }
  }
  return {
    rule_code: 'R-LOG-04', result: pairs.length ? 'INDETERMINATE' : 'PASS',
    detail: pairs.length ? `logger assignment(s) overlap in time: ${pairs.map((p) => p.join(' x ')).join('; ')}; readings in the overlap cannot be attributed`
      : 'no overlapping assignments on the assigned logger(s)',
    detail_json: { overlaps: pairs }, reading_ids: [], ...(pairs.length ? { issue_type: 'ASSIGNMENT_OVERLAP' } : {}),
  };
}

// R-LOG-05: data-quality alert only
export function checkReadingAssignmentConsistency(readings) {
  const bad = readings.filter((r) => r.row.logger_assignment_id !== r.derivedAssignmentId);
  return {
    rule_code: 'R-LOG-05', result: bad.length ? 'WARNING' : 'PASS',
    detail: bad.length ? `${bad.length} reading(s) reference a logger_assignment_id that differs from the assignment window they fall in`
      : 'reading assignment references agree with assignment windows',
    detail_json: { mismatched: bad.length }, reading_ids: bad.slice(0, 20).map((r) => r.reading_id),
  };
}
