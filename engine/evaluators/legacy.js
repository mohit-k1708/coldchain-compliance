import { ms } from '../time.js';

// R-ISO-01 (legacy reports leaving the shipment window) and LEGACY_DURATION_MISMATCH.
export function evaluateLegacyExcursions(legacyExcursions, confirmedRuns, depMs, arrMs) {
  const rows = legacyExcursions.filter((x) => x.source === 'LEGACY_IMPORT');
  const outside = [], mismatch = [];
  for (const x of rows) {
    const s = x.start_time ? ms(x.start_time) : null, e = x.end_time ? ms(x.end_time) : null;
    if (s === null && e === null) continue;
    if ((s !== null && (s < depMs || s > arrMs)) || (e !== null && (e < depMs || e > arrMs))) { outside.push(x); continue; }
    const run = confirmedRuns.find((r) => r.start_ms === s);
    if (!run || run.duration_minutes !== x.duration_minutes) {
      mismatch.push({ excursion_id: x.excursion_id, legacy_minutes: x.duration_minutes, engine_minutes: run ? run.duration_minutes : null });
    }
  }
  const iso = outside.length
    ? { rule_code: 'R-ISO-01', result: 'WARNING',
        detail: `legacy report(s) ${outside.map((x) => `${x.excursion_id} (${x.issue_type} ${x.start_time}..${x.end_time})`).join(', ')} extend outside this shipment's window; runs are computed per assignment window, so they are not attributed to this shipment`,
        detail_json: { reports: outside.map((x) => x.excursion_id) }, reading_ids: [], issue_type: 'CROSS_SHIPMENT_REPORT' }
    : { rule_code: 'R-ISO-01', result: 'PASS', detail: `excursion runs computed per assignment window; ${rows.length} legacy report(s) all inside the shipment window`,
        detail_json: { legacy_reports: rows.length }, reading_ids: [] };
  const dur = mismatch.length
    ? { rule_code: 'LEGACY_DURATION_MISMATCH', result: 'WARNING',
        detail: `legacy excursion duration differs from the recomputed run: ${mismatch.map((m) => `${m.excursion_id} legacy ${m.legacy_minutes} min vs engine ${m.engine_minutes ?? 'none'} min`).join('; ')}`,
        detail_json: { mismatches: mismatch }, reading_ids: [] }
    : null;
  return { iso, dur };
}

// R-SILENT-01: legacy said PASS but the engine disagrees.
export function evaluateSilentPass(legacyReports, status) {
  const passes = legacyReports.filter((r) => r.reported_status === 'PASS');
  if (status === 'COMPLIANT' || passes.length === 0) return null;
  return { rule_code: 'R-SILENT-01', result: 'WARNING',
    detail: `legacy report ${passes[0].legacy_report_id} says PASS but the engine decision is ${status}`,
    detail_json: { legacy_report_id: passes[0].legacy_report_id, engine_status: status }, reading_ids: [] };
}
