import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { createApp } from './app.js';
import { openDb } from './db.js';

const port = Number(process.env.PORT ?? 3001);
const dbPath = resolve(process.env.DB_PATH ?? 'data/app.db');
if (!existsSync(dbPath)) { console.error(`database ${dbPath} not found; run: npm run db:build`); process.exit(1); }
const app = createApp(openDb(dbPath));
app.listen(port, () => console.log(`API listening on http://localhost:${port} (db ${dbPath})`));
