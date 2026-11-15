import * as ids from './ids.js';
import { iso, GRID, MIN } from './time.js';

// One reading per 10-minute grid point from departure to arrival inclusive. AR(1) around range midpoint.
export function generateReadings(rng, { logger, assignmentId, departureMs, arrivalMs, policy }) {
  const mid = (policy.min_temp_c + policy.max_temp_c) / 2;
  const half = (policy.max_temp_c - policy.min_temp_c) / 2;
  const lim = 0.6 * half;
  const clamp = (x) => Math.max(-lim, Math.min(lim, x));
  const phi = 0.9;
  let dev = clamp(rng.normal(0, half * 0.2));
  const rows = [];
  for (let t = departureMs; t <= arrivalMs; t += GRID) {
    dev = clamp(phi * dev + rng.normal(0, half * 0.08));
    rows.push({
      reading_id: ids.readingId(logger.logger_id, t),
      logger_id: logger.logger_id,
      logger_assignment_id: assignmentId,
      recorded_at: iso(t),
      received_at: iso(t + rng.int(1, 5) * MIN),
      temperature_c: Math.round((mid + dev) * 100) / 100,
      calibration_uncertainty_c: logger.calibration_uncertainty_c,
      reading_quality: 'GOOD',
    });
  }
  return rows;
}
