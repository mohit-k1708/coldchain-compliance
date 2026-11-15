import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build, render } from '../../scripts/edgeCases.js';

const header = (md) => md.split('\n').find((l) => /\| case \| shipment|\| scenario \| synthetic input/.test(l));

function wellFormed(md, name) {
  const lines = md.split('\n');
  const i = lines.findIndex((l) => /\| (case|scenario) \|/.test(l));
  assert.ok(i >= 0, `${name}: edge-case table header not found`);
  const cols = (l) => l.trim().replace(/^\||\|$/g, '').split('|').length;
  assert.match(lines[i + 1], /^\|(\s*:?-+:?\s*\|)+$/, `${name}: separator row missing`);
  assert.equal(cols(lines[i + 1]), cols(lines[i]), `${name}: separator column count`);
  for (let j = i + 2; j < lines.length && lines[j].startsWith('|'); j++) assert.equal(cols(lines[j]), cols(lines[i]), `${name}: row ${j - i} column count`);
  assert.doesNotMatch(lines[i], /\\#/, `${name}: header must not contain an escaped "\\#"`);
}

test('generated edge-case markdown has no backslash-escaped "#" and a well-formed table', () => {
  const md = render(build());
  assert.ok(!md.includes('\\#'), 'generated markdown contains \\#');
  wellFormed(md, 'generated EDGE-CASES');
  assert.match(header(md), /^\| No\. \| case \|/);
});

test('committed docs/EDGE-CASES.md equals a fresh generation (not hand-edited)', () => {
  assert.equal(readFileSync(resolve('docs/EDGE-CASES.md'), 'utf8'), render(build()));
});

test('README edge-case table header is well formed and has no escaped "#"', () => {
  const md = readFileSync(resolve('README.md'), 'utf8');
  assert.ok(!md.includes('\\#'), 'README contains \\#');
  wellFormed(md, 'README');
});

test('README has the real clone URL and no placeholder', () => {
  const md = readFileSync(resolve('README.md'), 'utf8');
  assert.ok(!md.includes('<repository-url>'));
  assert.match(md, /git clone https:\/\/github\.com\/mohit-k1708\/coldchain-compliance\.git\ncd coldchain-compliance\n/);
});
