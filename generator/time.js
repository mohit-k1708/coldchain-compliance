// Time helpers. All values derive from fixed dates; nothing reads the wall clock.
export const MIN = 60000;
export const HOUR = 3600000;
export const DAY = 86400000;
export const GRID = 10 * MIN;

export const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');
export const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);
export const parse = (s) => Date.parse(s);
export function addYears(ms, years) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear() + years, d.getUTCMonth(), d.getUTCDate());
}
