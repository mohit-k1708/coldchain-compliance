export const MIN = 60000;
export const HOUR = 3600000;
export const DAY = 86400000;
export const ms = (s) => Date.parse(s);
export const iso = (t) => new Date(t).toISOString().replace('.000Z', 'Z');
export const cents = (x) => Math.round(Number(x) * 100); // exact-decimal comparisons: no float drift at limits
export const round2 = (x) => Math.round(x * 100) / 100;
