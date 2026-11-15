import { useCallback, useEffect, useState } from 'react';

// fetch wrapper: sends x-role, parses {error:{code,message}} and throws a typed ApiError.
let currentRole = 'analyst';
export const setApiRole = (role) => { currentRole = role; };
export const getApiRole = () => currentRole;

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export async function api(path, { method = 'GET', body, role = currentRole } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: { 'x-role': role, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the API. Is the server running?');
  }
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!res.ok) {
    const e = json?.error;
    throw new ApiError(res.status, e?.code ?? 'HTTP_ERROR', e?.message ?? `Request failed (${res.status})`);
  }
  return json;
}

export const qs = (params) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const apiGet = (path, params) => api(path + qs(params));
export const apiPost = (path, body) => api(path, { method: 'POST', body: body ?? {} });

// data hook: GET path+params; reloads when they change; ignores stale responses.
export function useApi(path, params) {
  const key = path ? path + qs(params) : null;
  const [state, setState] = useState({ data: null, error: null, loading: key !== null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (key === null) return undefined;
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    api(key).then((data) => live && setState({ data, error: null, loading: false }), (error) => live && setState({ data: null, error, loading: false }));
    return () => { live = false; };
  }, [key, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
