// Deterministic PRNG (mulberry32). Never use Math.random for data.
export function createRng(seed) {
  let a = Number(seed) >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min, max) => min + Math.floor(next() * (max - min + 1));
  const pick = (arr) => arr[int(0, arr.length - 1)];
  const chance = (p) => next() < p;
  const normal = (mean = 0, sd = 1) => {
    const u1 = 1 - next();
    const u2 = next();
    return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };
  return { next, int, pick, chance, normal };
}
