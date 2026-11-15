import { describe, it, expect } from 'vitest';
import { allowedNext, requiredFields, missingFields, newEventId, STATES } from './workflow.js';

describe('allowedNext (mirrors engine/exceptions.js)', () => {
  it('lists only legal next states', () => {
    expect(allowedNext('OPEN')).toEqual(['ASSIGNED']);
    expect(allowedNext('ASSIGNED')).toEqual(['INVESTIGATING']);
    expect(allowedNext('INVESTIGATING')).toEqual(['RESOLVED', 'ESCALATED']);
    expect(allowedNext('ESCALATED')).toEqual(['INVESTIGATING', 'RESOLVED']);
  });
  it('RESOLVED is terminal and unknown statuses have no moves', () => {
    expect(allowedNext('RESOLVED')).toEqual([]);
    expect(allowedNext('BOGUS')).toEqual([]);
    expect(allowedNext(undefined)).toEqual([]);
  });
  it('returns a copy, never the internal array', () => {
    allowedNext('OPEN').push('RESOLVED');
    expect(allowedNext('OPEN')).toEqual(['ASSIGNED']);
  });
  it('never allows a self move or a move back to OPEN', () => {
    for (const s of STATES) { expect(allowedNext(s)).not.toContain(s); expect(allowedNext(s)).not.toContain('OPEN'); }
  });
});

describe('requiredFields', () => {
  it('maps each target state to its required input', () => {
    expect(requiredFields('ASSIGNED')).toEqual(['analyst']);
    expect(requiredFields('ESCALATED')).toEqual(['note']);
    expect(requiredFields('RESOLVED')).toEqual(['resolution']);
    expect(requiredFields('INVESTIGATING')).toEqual([]);
  });
  it('missingFields treats blank and whitespace as missing', () => {
    expect(missingFields('ASSIGNED', { analyst: '  ' })).toEqual(['analyst']);
    expect(missingFields('RESOLVED', { resolution: 'replaced probe' })).toEqual([]);
    expect(missingFields('ESCALATED', undefined)).toEqual(['note']);
  });
});

describe('newEventId', () => {
  it('is unique per call', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newEventId(1700000000000)));
    expect(ids.size).toBe(200);
  });
});
