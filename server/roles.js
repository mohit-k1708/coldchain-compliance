// Simulated roles (NO authentication): the x-role header selects a role; permissions are an explicit table.
import { badRequest, forbidden } from './http.js';

export const ROLES = ['supplier', 'planner', 'carrier', 'analyst', 'manager'];
export const DEFAULT_ROLE = 'analyst';

export const PERMISSIONS = {
  supplier: ['parties:create', 'products:create', 'lots:create', 'policies:create'],
  planner: ['parties:create', 'shipments:create', 'packaging:create', 'loggers:create', 'shipments:assign-logger', 'route-stops:create', 'shipments:status'],
  carrier: ['custody-events:create', 'readings:ingest', 'route-stops:create', 'shipments:status'], // actual route updates, custody, readings
  analyst: ['shipments:evaluate', 'exceptions:transition', 'exceptions:decide'],
  manager: ['exceptions:decide'], // read-only + RESOLVED / ESCALATED decisions
};

export function roleOf(req) {
  const r = req.get('x-role') ?? DEFAULT_ROLE;
  if (!ROLES.includes(r)) throw badRequest(`x-role must be one of ${ROLES.join(', ')}`, 'INVALID_ROLE');
  return r;
}

export const can = (role, permission) => PERMISSIONS[role].includes(permission);

export const requires = (permission) => (req, res, next) => {
  try {
    const role = roleOf(req);
    if (!can(role, permission)) throw forbidden(`role ${role} is not allowed to ${permission}`);
    next();
  } catch (e) { next(e); }
};
