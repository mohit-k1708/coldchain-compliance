import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { parseSchema } from '../../generator/schema.js';

const read = (f) => readFileSync(resolve(f), 'utf8');
const schemaSql = read('database/schema.sql');
const tables = Object.keys(parseSchema(schemaSql).tables ?? parseSchema(schemaSql));

test('every table in schema.sql appears in DATA-DICTIONARY.md and DATABASE-SCHEMA.md', () => {
  assert.equal(tables.length, 22);
  for (const doc of ['docs/DATA-DICTIONARY.md', 'docs/DATABASE-SCHEMA.md']) {
    const text = read(doc);
    for (const t of tables) assert.match(text, new RegExp(`\\b${t}\\b`), `${t} missing from ${doc}`);
  }
});

test('every enum value in schema.sql appears in BUSINESS-RULES.md', () => {
  const rules = read('docs/BUSINESS-RULES.md');
  const values = new Set();
  for (const m of schemaSql.matchAll(/\bIN\s*\(([^)]*)\)/g)) for (const v of m[1].matchAll(/'([^']+)'/g)) values.add(v[1]);
  assert.ok(values.size > 40, `expected many enum values, got ${values.size}`);
  for (const v of values) assert.ok(rules.includes(v), `enum value ${v} missing from BUSINESS-RULES.md`);
});

test('every npm script mentioned in the docs exists in package.json', () => {
  const scripts = JSON.parse(read('package.json')).scripts;
  const builtin = new Set(['install', 'ci', 'test', 'start', 'run', 'init', 'audit', 'version', 'publish']);
  for (const f of ['README.md', ...readdirSync('docs').filter((x) => x.endsWith('.md')).map((x) => `docs/${x}`)]) {
    const text = read(f);
    for (const m of text.matchAll(/npm run ([a-z][\w:-]*)/g)) assert.ok(scripts[m[1]], `${f}: "npm run ${m[1]}" is not a package.json script`);
    for (const m of text.matchAll(/npm (?:--prefix client )?(test|start)\b/g)) assert.ok(builtin.has(m[1]));
  }
});

test('README mentions the client scripts that exist in client/package.json', () => {
  const clientScripts = JSON.parse(read('client/package.json')).scripts;
  const text = read('README.md');
  for (const m of text.matchAll(/npm --prefix client (?:run )?([a-z]+)/g)) assert.ok(clientScripts[m[1]], `client script ${m[1]} missing`);
});

test('relative links between docs resolve', () => {
  const files = ['README.md', ...readdirSync('docs').filter((x) => x.endsWith('.md')).map((x) => `docs/${x}`),
    ...readdirSync('docs/examples').filter((x) => x.endsWith('.md')).map((x) => `docs/examples/${x}`)];
  const broken = [];
  for (const f of files) {
    const text = read(f).replace(/```[\s\S]*?```/g, '');
    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = m[1].split('#')[0];
      if (!target || /^(https?:|mailto:)/.test(target)) continue;
      const p = resolve(dirname(f), target);
      if (!existsSync(p)) broken.push(`${f} -> ${m[1]}`);
    }
  }
  assert.deepEqual(broken, []);
  void statSync;
});
