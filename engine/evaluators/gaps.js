import { iso, MIN } from '../time.js';

// R-GAP-01. Spacing is measured departure -> readings -> arrival; gap minutes are never assumed in range.
export function detectMissingReadings(readings, { depMs, arrMs, samplingMin, maxGapMin }) {
  const pts = [{ t: depMs, id: null }, ...readings.map((r) => ({ t: r.t, id: r.reading_id })), { t: arrMs, id: null }];
  const gaps = [];
  const missingSamples = [];
  for (let i = 1; i < pts.length; i++) {
    const spacing = (pts[i].t - pts[i - 1].t) / MIN;
    const missing = Math.max(0, Math.round(spacing / samplingMin) - 1);
    const ts = [];
    for (let k = 1; k <= missing; k++) ts.push(iso(pts[i - 1].t + k * samplingMin * MIN));
    missingSamples.push(...ts);
    if (spacing > maxGapMin) {
      gaps.push({ from: iso(pts[i - 1].t), to: iso(pts[i].t), minutes: spacing, from_reading_id: pts[i - 1].id,
        to_reading_id: pts[i].id, missing_samples: ts });
    }
  }
  const finding = {
    rule_code: 'R-GAP-01',
    result: gaps.length ? 'INDETERMINATE' : missingSamples.length ? 'WARNING' : 'PASS',
    detail: gaps.length
      ? `${gaps.length} data gap(s) longer than ${maxGapMin} min (largest ${Math.max(...gaps.map((g) => g.minutes))} min, ${missingSamples.length} missing samples); gap time is not assumed in range`
      : missingSamples.length
        ? `${missingSamples.length} missing sample(s) but every spacing is within ${maxGapMin} min`
        : `no missing samples (${readings.length} readings, every spacing within ${maxGapMin} min)`,
    detail_json: { max_data_gap_minutes: maxGapMin, missing_sample_count: missingSamples.length,
      missing_samples: missingSamples, gaps },
    reading_ids: gaps.flatMap((g) => [g.from_reading_id, g.to_reading_id].filter(Boolean)),
    ...(gaps.length ? { issue_type: 'MISSING_DATA', severity: 'MEDIUM' } : {}),
  };
  return { finding, gaps, missing_sample_count: missingSamples.length };
}
