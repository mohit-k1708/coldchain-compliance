import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { makeDb, startServer } from './helpers.js';
import { createApp } from '../../server/app.js';

// Uses the real client/dist when it was built (npm run client:build); otherwise a tiny stand-in so the test never depends on a build.
const realDist = resolve('client/dist');
let clientDir = realDist;
let usingStub = false;
if (!existsSync(resolve(realDist, 'index.html'))) {
  clientDir = mkdtempSync(resolve(tmpdir(), 'cc-dist-'));
  mkdirSync(resolve(clientDir, 'assets'));
  writeFileSync(resolve(clientDir, 'index.html'), '<!doctype html><html><body><div id="root"></div></body></html>');
  usingStub = true;
}

let srv, db, base;
before(async () => {
  ({ db } = makeDb());
  const server = createApp(db, { clientDir }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  srv = server;
});
after(() => srv.close());

test(`GET / returns the HTML page (${usingStub ? 'stub dist' : 'real client/dist'})`, async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.match(await res.text(), /<div id="root">/);
});

test('SPA fallback: a client route returns index.html', async () => {
  for (const p of ['/shipments/SHP-2026-000001', '/exceptions', '/evaluation']) {
    const res = await fetch(base + p);
    assert.equal(res.status, 200, p);
    assert.match(res.headers.get('content-type'), /text\/html/);
    assert.match(await res.text(), /<div id="root">/);
  }
});

test('unknown /api path is a JSON 404, never index.html', async () => {
  const res = await fetch(`${base}/api/nope`);
  assert.equal(res.status, 404);
  assert.match(res.headers.get('content-type'), /application\/json/);
  const j = await res.json();
  assert.equal(j.error.code, 'NOT_FOUND');
});

test('API routes still work next to the static UI', async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);
});

test('GET /api/evaluation has the expected shape', async () => {
  const res = await fetch(`${base}/api/evaluation`);
  if (res.status === 404) { // report not generated in this checkout: must be a JSON error
    assert.equal((await res.json()).error.code, 'NOT_FOUND');
    return;
  }
  assert.equal(res.status, 200);
  const j = await res.json();
  for (const k of ['primary', 'ablation', 'holdout', 'limitations']) assert.ok(k in j, k);
  assert.equal(typeof j.primary.metrics.accuracy, 'number');
  assert.deepEqual(Object.keys(j.primary.metrics.confusion).sort(), ['COMPLIANT', 'INDETERMINATE', 'NON_COMPLIANT']);
  assert.ok(Array.isArray(j.ablation) && j.ablation.length > 0);
  assert.ok(Array.isArray(j.limitations) && j.limitations.length > 0);
  assert.equal(typeof j.primary.naive.accuracy, 'number');
});

test('GET /api/evaluation returns a JSON 404 when the file is missing', async () => {
  const s = createApp(db, { clientDir, evaluationFile: resolve(tmpdir(), 'does-not-exist.json') }).listen(0);
  await new Promise((r) => s.once('listening', r));
  const res = await fetch(`http://127.0.0.1:${s.address().port}/api/evaluation`);
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error.code, 'NOT_FOUND');
  s.close();
});

test('POST to an unknown non-api path is not served index.html', async () => {
  const res = await fetch(`${base}/shipments`, { method: 'POST' });
  assert.equal(res.status, 404);
});
