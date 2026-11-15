// Pure functions: readings endpoint payload -> chart points and shaded areas (X axis is epoch ms).
const toMs = (iso) => Date.parse(iso);

export function buildPoints(readings) {
  return (readings ?? [])
    .map((r) => ({ id: r.reading_id, t: toMs(r.recorded_at), temp: r.temperature_c, unc: r.uncertainty_c ?? null, cls: r.classification ?? 'UNKNOWN', recorded_at: r.recorded_at }))
    .filter((p) => Number.isFinite(p.t) && p.temp !== null && p.temp !== undefined)
    .sort((a, b) => a.t - b.t);
}

// A single-point excursion (end == start or no end) gets minWidthMs so it stays visible.
// Periods are clamped to the chart domain; periods outside it are dropped.
export function buildAreas(periods, domain, { minWidthMs = 5 * 60000 } = {}) {
  const out = [];
  for (const p of periods ?? []) {
    let x1 = toMs(p.start_time);
    if (!Number.isFinite(x1)) continue;
    let x2 = p.end_time ? toMs(p.end_time) : x1;
    if (!Number.isFinite(x2) || x2 < x1) x2 = x1;
    if (x2 - x1 < minWidthMs) { const mid = (x1 + x2) / 2; x1 = mid - minWidthMs / 2; x2 = mid + minWidthMs / 2; }
    if (domain && Number.isFinite(domain[0]) && Number.isFinite(domain[1])) {
      x1 = Math.max(x1, domain[0]); x2 = Math.min(x2, domain[1]);
      if (x2 < x1) continue;
    }
    out.push({ x1, x2, issue_type: p.issue_type, severity: p.severity ?? null, duration_minutes: p.duration_minutes ?? null, peak: p.peak_temperature_c ?? null });
  }
  return out.sort((a, b) => a.x1 - b.x1);
}

export function chartDomain(payload, points) {
  const from = toMs(payload?.window?.from), to = toMs(payload?.window?.to);
  const ts = points.map((p) => p.t);
  const lo = Number.isFinite(from) ? from : (ts.length ? Math.min(...ts) : null);
  const hi = Number.isFinite(to) ? to : (ts.length ? Math.max(...ts) : null);
  return lo === null || hi === null ? null : [lo, hi];
}

export function yDomain(points, policy) {
  const vals = points.map((p) => p.temp);
  if (policy) vals.push(policy.min_temp_c, policy.max_temp_c);
  const clean = vals.filter((v) => Number.isFinite(v));
  if (!clean.length) return [0, 10];
  return [Math.floor(Math.min(...clean) - 1), Math.ceil(Math.max(...clean) + 1)];
}

export function buildChartData(payload) {
  const points = buildPoints(payload?.readings);
  const domain = chartDomain(payload, points);
  const policy = payload?.policy ?? null;
  return {
    points, domain, policy, y: yDomain(points, policy),
    excursions: buildAreas(payload?.excursion_periods, domain),
    gaps: buildAreas(payload?.gap_periods, domain),
    counts: payload?.counts ?? { IN: 0, OUT: 0, MARGINAL: 0 },
    empty: points.length === 0,
  };
}

export const DOT_COLORS = { IN: '#1b7f3b', OUT: '#c62828', MARGINAL: '#d98300', UNKNOWN: '#666666' };
