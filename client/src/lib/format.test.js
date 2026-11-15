import { describe, it, expect } from 'vitest';
import { formatDateTime, formatDuration, formatNumber, formatPercent, formatTemp, formatTick, ruleOf } from './format.js';

describe('formatDateTime', () => {
  it('formats UTC ISO strings', () => { expect(formatDateTime('2026-03-01T07:05:00Z')).toBe('2026-03-01 07:05 UTC'); });
  it('handles empty and invalid input', () => {
    expect(formatDateTime(null)).toBe('-');
    expect(formatDateTime('')).toBe('-');
    expect(formatDateTime('not a date')).toBe('not a date');
  });
});

describe('formatDuration', () => {
  it('uses minutes, hours and days', () => {
    expect(formatDuration(0)).toBe('0 min');
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(60)).toBe('1 h');
    expect(formatDuration(90)).toBe('1 h 30 min');
    expect(formatDuration(1440)).toBe('1 d');
    expect(formatDuration(1500)).toBe('1 d 1 h');
  });
  it('returns a dash for missing or negative values', () => {
    expect(formatDuration(null)).toBe('-');
    expect(formatDuration(undefined)).toBe('-');
    expect(formatDuration('x')).toBe('-');
    expect(formatDuration(-5)).toBe('-');
  });
});

describe('numbers', () => {
  it('formatNumber groups thousands and handles missing', () => {
    expect(formatNumber(5000)).toBe('5,000');
    expect(formatNumber(1.234, 2)).toBe('1.23');
    expect(formatNumber(null)).toBe('-');
  });
  it('formatPercent and formatTemp', () => {
    expect(formatPercent(1)).toBe('100.0%');
    expect(formatPercent(0.8312, 2)).toBe('83.12%');
    expect(formatPercent(null)).toBe('N/A');
    expect(formatTemp(4.5)).toBe('4.50 °C');
    expect(formatTemp(undefined)).toBe('-');
  });
  it('formatTick gives a short axis label', () => {
    expect(formatTick(Date.parse('2026-03-01T07:05:00Z'))).toBe('03-01 07:05');
    expect(formatTick(NaN)).toBe('');
  });
  it('ruleOf extracts the rule code from a reason', () => {
    expect(ruleOf('NON_COMPLIANT [R-TEMP-03]: 60 min')).toBe('R-TEMP-03');
    expect(ruleOf('COMPLIANT')).toBeNull();
    expect(ruleOf(null)).toBeNull();
  });
});
