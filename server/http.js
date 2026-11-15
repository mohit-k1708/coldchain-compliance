// Error type, error mapping and small request helpers. Errors always look like {error:{code,message}}; never a stack trace.
export class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export const badRequest = (message, code = 'VALIDATION_ERROR') => new HttpError(400, code, message);
export const forbidden = (message) => new HttpError(403, 'FORBIDDEN', message);
export const notFound = (message) => new HttpError(404, 'NOT_FOUND', message);
export const conflict = (message, code = 'CONFLICT') => new HttpError(409, code, message);

export const wrap = (fn) => (req, res, next) => { try { fn(req, res, next); } catch (e) { next(e); } };

function sqliteToHttp(e) {
  const m = String(e && e.message);
  if (/UNIQUE constraint failed/.test(m)) return conflict('a record with these key values already exists');
  if (/FOREIGN KEY constraint failed/.test(m)) return badRequest('a referenced record does not exist', 'UNKNOWN_REFERENCE');
  if (/CHECK constraint failed|NOT NULL constraint failed/.test(m)) return badRequest('a value violates a data constraint', 'CONSTRAINT_VIOLATION');
  return null;
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  let e = err;
  if (!(e instanceof HttpError)) {
    if (e && e.type === 'entity.parse.failed') e = badRequest('request body is not valid JSON', 'INVALID_JSON');
    else if (e && e.type === 'entity.too.large') e = new HttpError(413, 'PAYLOAD_TOO_LARGE', 'request body exceeds 5 MB');
    else e = sqliteToHttp(e) ?? new HttpError(500, 'INTERNAL_ERROR', 'internal error');
    if (e.status === 500 && process.env.API_DEBUG) console.error(err);
  }
  res.status(e.status).json({ error: { code: e.code, message: e.message } });
}

export function paging(query) {
  const num = (v, d, name) => {
    if (v === undefined) return d;
    if (!/^\d+$/.test(String(v)) || Number(v) < 1) throw badRequest(`${name} must be a positive integer`);
    return Number(v);
  };
  const page = num(query.page, 1, 'page');
  const pageSize = Math.min(200, num(query.pageSize, 25, 'pageSize')); // capped at 200
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export const oneOf = (v, allowed, name) => {
  if (v === undefined || v === '') return undefined;
  if (!allowed.includes(v)) throw badRequest(`${name} must be one of ${allowed.join(', ')}`);
  return v;
};

// minimal by-hand body validation. spec: {field: 'string'|'int'|'number'|'ts'|'date'|['enum', ...]} ; add '?' suffix for optional
const TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
export function body(req) {
  const b = req.body === undefined ? {} : req.body;
  if (b === null || typeof b !== 'object' || Array.isArray(b)) throw badRequest('request body must be a JSON object');
  return b;
}
export function validate(b, spec) {
  const out = {};
  for (const [field, raw] of Object.entries(spec)) {
    const optional = typeof raw === 'string' && raw.endsWith('?');
    const type = typeof raw === 'string' ? raw.replace('?', '') : raw;
    const v = b[field];
    if (v === undefined || v === null) { if (optional) { out[field] = null; continue; } throw badRequest(`${field} is required`); }
    if (Array.isArray(type)) { if (!type.includes(v)) throw badRequest(`${field} must be one of ${type.join(', ')}`); }
    else if (type === 'string') { if (typeof v !== 'string' || v.trim() === '') throw badRequest(`${field} must be a non-empty string`); }
    else if (type === 'int') { if (!Number.isInteger(v)) throw badRequest(`${field} must be an integer`); }
    else if (type === 'number') { if (typeof v !== 'number' || !Number.isFinite(v)) throw badRequest(`${field} must be a number`); }
    else if (type === 'ts') { if (typeof v !== 'string' || !TS.test(v) || Number.isNaN(Date.parse(v))) throw badRequest(`${field} must be an ISO UTC timestamp like 2026-03-10T10:00:00Z`); }
    else if (type === 'date') { if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw badRequest(`${field} must be a date like 2026-03-10`); }
    out[field] = v;
  }
  return out;
}
export const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
