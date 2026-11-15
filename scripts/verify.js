// npm run verify: unit/integration tests + validation of the committed sample + reproducibility at 100 shipments. Writes no docs.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const node = process.execPath;
const steps = [
  ['npm test', node, ['--test', 'tests/**/*.test.js']],
  ['validate committed sample', node, ['generator/validateData.js', '--in=data/sample']],
  ['reproduce (100 shipments, twice)', node, ['scripts/reproduce.js', '--shipments=100', '--doc=']],
];
const t0 = performance.now();
for (const [name, cmd, args] of steps) {
  const t = performance.now();
  console.log(`\n== ${name}`);
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' });
  const s = ((performance.now() - t) / 1000).toFixed(1);
  if (r.status !== 0) { console.error(`\nverify FAILED at "${name}" (exit ${r.status}, ${s} s)`); process.exit(r.status || 1); }
  console.log(`-- ${name}: ok (${s} s)`);
}
console.log(`\nverify PASSED in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
