// Mirrors engine/exceptions.js (ALLOWED transitions and required inputs).
export const STATES = ['OPEN', 'ASSIGNED', 'INVESTIGATING', 'RESOLVED', 'ESCALATED'];

const ALLOWED = {
  OPEN: ['ASSIGNED'],
  ASSIGNED: ['INVESTIGATING'],
  INVESTIGATING: ['RESOLVED', 'ESCALATED'],
  ESCALATED: ['INVESTIGATING', 'RESOLVED'],
  RESOLVED: [],
};

export const allowedNext = (status) => [...(ALLOWED[status] ?? [])];

const REQUIRED = { ASSIGNED: ['analyst'], ESCALATED: ['note'], RESOLVED: ['resolution'] };
export const requiredFields = (toStatus) => [...(REQUIRED[toStatus] ?? [])];

// returns the missing required field names for a form {analyst, note, resolution}
export function missingFields(toStatus, form) {
  return requiredFields(toStatus).filter((f) => !String(form?.[f] ?? '').trim());
}

let counter = 0;
export function newEventId(now = Date.now()) {
  counter = (counter + 1) % 1000;
  return `EVT-UI-${now.toString(36).toUpperCase()}${String(counter).padStart(3, '0')}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}
