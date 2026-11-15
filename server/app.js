import express from 'express';
import { resolve, dirname } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readRoutes } from './routes/read.js';
import { writeRoutes } from './routes/write.js';
import { errorHandler, notFound } from './http.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function createApp(db, { clientDir = resolve(ROOT, 'client/dist'), evaluationFile = resolve(ROOT, 'docs/EVALUATION-REPORT.json') } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '5mb' }));
  app.get('/api/evaluation', (req, res, next) => {
    if (!existsSync(evaluationFile)) return next(notFound('docs/EVALUATION-REPORT.json not found; run: npm run metrics'));
    res.type('application/json').send(readFileSync(evaluationFile, 'utf8'));
  });
  app.use('/api', readRoutes(db));
  app.use('/api', writeRoutes(db));
  app.use('/api', (req, res, next) => next(notFound(`no such endpoint: ${req.method} ${req.originalUrl.split('?')[0]}`)));
  if (existsSync(resolve(clientDir, 'index.html'))) { // built UI: static files + SPA fallback for non-/api GETs
    app.use(express.static(clientDir));
    app.use((req, res, next) => (req.method === 'GET' && !req.path.startsWith('/api') ? res.sendFile(resolve(clientDir, 'index.html')) : next()));
  }
  app.use((req, res, next) => next(notFound(`no such endpoint: ${req.method} ${req.path}`)));
  app.use(errorHandler);
  return app;
}
