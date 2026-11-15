import { deriveRng } from './prng.js';
import { INJECTOR_LABELS } from './injectors.js';

export const DEFAULT_MIX = {
  NONE: 68, BOUNDARY_AT_LIMIT: 2, EXCURSION_WITHIN_ALLOWANCE: 5, TEMPERATURE_EXCURSION: 8, CALIBRATION_MARGINAL: 2,
  MISSING_DATA: 3, MISSING_DATA_SILENTLY_PASSED: 2, LOGGER_NOT_ASSIGNED: 2, CALIBRATION_EXPIRED: 1,
  POLICY_MISMATCH: 2, CUSTODY_GAP: 2, CROSS_SHIPMENT_EXCURSION: 1, ROUTE_DEVIATION: 2,
};
const CROSS = 'CROSS_SHIPMENT_EXCURSION';

function countsFromMix(N, mix) {
  const entries = Object.entries(mix);
  const total = entries.reduce((s, [, p]) => s + p, 0);
  const exact = entries.map(([l, p], i) => ({ l, i, x: (N * p) / total }));
  const counts = Object.fromEntries(exact.map((e) => [e.l, Math.floor(e.x)]));
  let left = N - Object.values(counts).reduce((s, c) => s + c, 0);
  for (const e of [...exact].sort((a, b) => (b.x - Math.floor(b.x)) - (a.x - Math.floor(a.x)) || a.i - b.i)) {
    if (left-- <= 0) break;
    counts[e.l]++;
  }
  const take = (n) => { counts.NONE -= n; if (counts.NONE < 0) throw new Error('mix does not fit shipment count'); };
  if (N >= 100) for (const l of Object.keys(counts)) if (l !== 'NONE' && counts[l] < 2 && mix[l] > 0) { take(2 - counts[l]); counts[l] = 2; }
  if (counts[CROSS] % 2) { take(1); counts[CROSS]++; } // pairs only
  return counts;
}

// Returns one label per shipment (index n-1). Explicit `plan` wins; else mix 'default' | 'each' | {label: pct}.
export function resolvePlan({ seed, shipments, plan, mix = 'default' }) {
  let labels;
  if (Array.isArray(plan)) {
    labels = [...plan];
    if (shipments !== undefined && shipments !== labels.length) throw new Error('plan length != shipments');
  } else {
    if (mix === 'each') {
      labels = ['NONE', 'NONE', ...INJECTOR_LABELS, CROSS];
    } else {
      const counts = countsFromMix(shipments, mix === 'default' ? DEFAULT_MIX : mix);
      labels = Object.entries(counts).flatMap(([l, c]) => Array(c).fill(l));
    }
    const rng = deriveRng(seed, 'plan');
    for (let i = labels.length - 1; i > 0; i--) { const j = rng.int(0, i); [labels[i], labels[j]] = [labels[j], labels[i]]; }
  }
  for (const l of labels) if (l !== 'NONE' && !INJECTOR_LABELS.includes(l)) throw new Error(`unknown label ${l}`);
  if (labels.filter((l) => l === CROSS).length % 2) throw new Error('CROSS_SHIPMENT_EXCURSION must come in pairs');
  return labels;
}
