// Packages the full dataset: gzip every CSV into data/full/ only if all files are < 50 MB, else commit just MANIFEST.json.
import { readFileSync, writeFileSync, mkdirSync, statSync, createReadStream, createWriteStream, rmSync, readdirSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { resolve } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const dir = args.in ?? 'data/generated', out = args.out ?? 'data/full';
const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json'), 'utf8'));
const LIMIT = 50 * 1024 * 1024;
const sizes = Object.fromEntries(Object.keys(manifest.files).map((f) => [f, statSync(resolve(dir, f)).size]));
const biggest = Object.entries(sizes).sort((a, b) => b[1] - a[1])[0];
const gzip = biggest[1] < LIMIT;
mkdirSync(resolve(out), { recursive: true });
for (const f of readdirSync(resolve(out))) if (f.endsWith('.gz')) rmSync(resolve(out, f));
const command = `npm run generate -- --seed=${manifest.seed} --shipments=${manifest.shipments} --loggers=${manifest.loggers}`;
const doc = {
  note: gzip ? 'Gzipped CSVs are in this directory.' : `Not committed: the largest file (${biggest[0]}, ${(biggest[1] / 1048576).toFixed(1)} MB) exceeds the 50 MB limit. Regenerate with the command below; checksums are of the UNCOMPRESSED files.`,
  command, seed: manifest.seed, shipments: manifest.shipments, loggers: manifest.loggers, mix: manifest.mix, generator_version: manifest.generator_version,
  files: Object.fromEntries(Object.entries(manifest.files).map(([f, v]) => [f, { rows: v.rows, sha256: v.sha256, bytes: sizes[f] }])),
};
writeFileSync(resolve(out, 'MANIFEST.json'), JSON.stringify(doc, null, 2) + '\n', 'utf8');
if (gzip) for (const f of Object.keys(manifest.files)) await pipeline(createReadStream(resolve(dir, f)), createGzip({ level: 9 }), createWriteStream(resolve(out, `${f}.gz`)));
console.log(gzip ? `gzipped ${Object.keys(manifest.files).length} files into ${out}` : `manifest only (${biggest[0]} is ${(biggest[1] / 1048576).toFixed(1)} MB > 50 MB)`);
