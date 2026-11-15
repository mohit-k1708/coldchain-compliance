import express from 'express';
import { readRoutes } from './routes/read.js';
import { writeRoutes } from './routes/write.js';
import { errorHandler, notFound } from './http.js';

export function createApp(db) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '5mb' }));
  app.use('/api', readRoutes(db));
  app.use('/api', writeRoutes(db));
  app.use((req, res, next) => next(notFound(`no such endpoint: ${req.method} ${req.path}`)));
  app.use(errorHandler);
  return app;
}
