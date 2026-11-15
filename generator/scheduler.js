import { parse, DAY, HOUR, MIN } from './time.js';

// Allocates loggers that are free and calibrated for the whole window.
// Busy intervals (not a single freeAt) so out-of-order requests (Phase 5) never overlap.
export function createScheduler(loggers) {
  const busy = new Map(loggers.map((l) => [l.logger_id, []]));
  const calib = new Map(loggers.map((l) => [l.logger_id,
    { from: parse(l.calibration_date), to: parse(l.calibration_expiry) + DAY }]));

  return {
    // departure/arrival: epoch ms. Assignment window is [dep-30m, arr+30m]; logger is held until arr+2h.
    allocate(departure, arrival) {
      const start = departure - 30 * MIN;
      const assignedTo = arrival + 30 * MIN;
      const holdUntil = arrival + 2 * HOUR;
      for (const l of loggers) {
        if (l.device_status !== 'AVAILABLE') continue;
        const c = calib.get(l.logger_id);
        if (c.from > start || c.to <= assignedTo) continue;
        if (busy.get(l.logger_id).some(([s, e]) => start < e && s < holdUntil)) continue;
        busy.get(l.logger_id).push([start, holdUntil]);
        return l;
      }
      return null;
    },
  };
}
