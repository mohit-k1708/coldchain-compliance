// Packages the full dataset: gzip every CSV into data/full/ and keep the .gz files only if EVERY COMPRESSED file is < 50 MB.
// MANIFEST.json (sha256 of the UNCOMPRESSED files, row counts, exact command) is always written.
import { readFileSync, writeFileSync, mkdirSync, statSync, createReadStream, createWriteStream, rmSync, readdirSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { resolve } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const dir = args.in ?? 'data/generated', out = args.out ?? 'data/full';
const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json'), 'utf8'));
const LIMIT = 50 * 1024 * 1024;
mkdirSync(resolve(out), { recursive: true });
for (const f of readdirSync(resolve(out))) if (f.endsWith('.gz')) rmSync(resolve(out, f));

const names = Object.keys(manifest.files);
const raw = Object.fromEntries(names.map((f) => [f, statSync(resolve(dir, f)).size]));
const gz = {};
for (const f of names) {
  await pipeline(createReadStream(resolve(dir, f)), createGzip({ level: 9, mtime: 0 }), createWriteStream(resolve(out, `${f}.gz`)));
  gz[f] = statSync(resolve(out, `${f}.gz`)).size;
}
const biggest = Object.entries(gz).sort((a, b) => b[1] - a[1])[0];
const keep = biggest[1] < LIMIT;
if (!keep) for (const f of names) rmSync(resolve(out, `${f}.gz`));

const command = `npm run generate -- --seed=${manifest.seed} --shipments=${manifest.shipments} --loggers=${manifest.loggers}`;
const doc = {
  note: keep ? 'Gzipped CSVs (*.csv.gz) are in this directory; every compressed file is under 50 MB. Checksums below are of the UNCOMPRESSED files.'
    : `Gzipped files not committed: the largest compressed file (${biggest[0]}, ${(biggest[1] / 1048576).toFixed(1)} MB) is not under 50 MB. Regenerate with the command below; checksums are of the UNCOMPRESSED files.`,
  command, seed: manifest.seed, shipments: manifest.shipments, loggers: manifest.loggers, mix: manifest.mix, generator_version: manifest.generator_version,
  files: Object.fromEntries(names.map((f) => [f, { rows: manifest.files[f].rows, sha256: manifest.files[f].sha256, bytes: raw[f], gzip_bytes: gz[f] }])),
};
writeFileSync(resolve(out, 'MANIFEST.json'), JSON.stringify(doc, null, 2) + '\n', 'utf8');
console.log(keep ? `kept ${names.length} gz files; largest compressed ${biggest[0]} ${(biggest[1] / 1048576).toFixed(1)} MB (< 50 MB)`
  : `removed gz files; largest compressed ${biggest[0]} ${(biggest[1] / 1048576).toFixed(1)} MB`);
