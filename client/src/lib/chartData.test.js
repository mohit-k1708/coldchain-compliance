import { describe, it, expect } from 'vitest';
import { buildPoints, buildAreas, buildChartData, chartDomain } from './chartData.js';

const rd = (id, t, temp, cls = 'IN') => ({ reading_id: id, recorded_at: t, temperature_c: temp, uncertainty_c: 0.3, classification: cls });
const T = (s) => Date.parse(s);

describe('buildPoints', () => {
  it('sorts by time and maps fields', () => {
    const p = buildPoints([rd('B', '2026-03-01T00:10:00Z', 5), rd('A', '2026-03-01T00:00:00Z', 4)]);
    expect(p.map((x) => x.id)).toEqual(['A', 'B']);
    expect(p[0]).toMatchObject({ t: T('2026-03-01T00:00:00Z'), temp: 4, unc: 0.3, cls: 'IN' });
  });
  it('handles a missing payload and drops unusable rows', () => {
    expect(buildPoints(undefined)).toEqual([]);
    expect(buildPoints([rd('X', 'garbage', 4), rd('Y', '2026-03-01T00:00:00Z', null)])).toEqual([]);
  });
});

describe('buildAreas', () => {
  const domain = [T('2026-03-01T00:00:00Z'), T('2026-03-01T06:00:00Z')];
  it('returns nothing when there are no excursions', () => {
    expect(buildAreas([], domain)).toEqual([]);
    expect(buildAreas(undefined, domain)).toEqual([]);
  });
  it('maps a normal period', () => {
    const a = buildAreas([{ issue_type: 'TEMP_HIGH', start_time: '2026-03-01T01:00:00Z', end_time: '2026-03-01T01:50:00Z', duration_minutes: 50, severity: 'HIGH' }], domain);
    expect(a).toEqual([{ x1: T('2026-03-01T01:00:00Z'), x2: T('2026-03-01T01:50:00Z'), issue_type: 'TEMP_HIGH', severity: 'HIGH', duration_minutes: 50, peak: null }]);
  });
  it('gives a single-point excursion (end == start or no end) a visible width', () => {
    const one = buildAreas([{ issue_type: 'TEMP_LOW', start_time: '2026-03-01T02:00:00Z', end_time: '2026-03-01T02:00:00Z' }], domain)[0];
    const open = buildAreas([{ issue_type: 'TEMP_LOW', start_time: '2026-03-01T02:00:00Z', end_time: null }], domain)[0];
    for (const a of [one, open]) { expect(a.x2 - a.x1).toBe(5 * 60000); expect((a.x1 + a.x2) / 2).toBe(T('2026-03-01T02:00:00Z')); }
  });
  it('clamps a gap at the edges of the window', () => {
    const left = buildAreas([{ issue_type: 'MISSING_DATA', start_time: '2026-02-28T23:00:00Z', end_time: '2026-03-01T00:40:00Z' }], domain)[0];
    expect(left.x1).toBe(domain[0]);
    const right = buildAreas([{ issue_type: 'MISSING_DATA', start_time: '2026-03-01T05:00:00Z', end_time: '2026-03-01T07:00:00Z' }], domain)[0];
    expect(right.x2).toBe(domain[1]);
  });
  it('drops periods outside the window and tolerates bad times', () => {
    expect(buildAreas([{ start_time: '2026-03-02T00:00:00Z', end_time: '2026-03-02T01:00:00Z' }, { start_time: 'nope' }], domain)).toEqual([]);
  });
  it('sorts areas and repairs an end before the start', () => {
    const a = buildAreas([{ start_time: '2026-03-01T03:00:00Z', end_time: '2026-03-01T02:00:00Z' }, { start_time: '2026-03-01T01:00:00Z', end_time: '2026-03-01T01:30:00Z' }], domain);
    expect(a[0].x1).toBeLessThan(a[1].x1);
  });
});

describe('buildChartData', () => {
  it('flags an empty readings payload and uses the default y range', () => {
    const d = buildChartData({ readings: [], window: { from: '2026-03-01T00:00:00Z', to: '2026-03-01T06:00:00Z' }, policy: null });
    expect(d.empty).toBe(true);
    expect(d.y).toEqual([0, 10]);
    expect(d.domain).toEqual([T('2026-03-01T00:00:00Z'), T('2026-03-01T06:00:00Z')]);
  });
  it('widens the y range to include the policy limits', () => {
    const d = buildChartData({ readings: [rd('A', '2026-03-01T00:00:00Z', 4.5)], policy: { min_temp_c: 2, max_temp_c: 8 }, window: {} });
    expect(d.y).toEqual([1, 9]);
    expect(d.excursions).toEqual([]);
    expect(d.gaps).toEqual([]);
  });
  it('derives the domain from readings when the window is unknown', () => {
    const pts = buildPoints([rd('A', '2026-03-01T00:00:00Z', 4), rd('B', '2026-03-01T01:00:00Z', 5)]);
    expect(chartDomain({}, pts)).toEqual([T('2026-03-01T00:00:00Z'), T('2026-03-01T01:00:00Z')]);
    expect(chartDomain({}, [])).toBeNull();
  });
});
