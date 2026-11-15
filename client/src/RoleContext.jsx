import { createContext, useContext, useState, useEffect } from 'react';
import { setApiRole } from './api.js';

export const ROLES = ['supplier', 'planner', 'carrier', 'analyst', 'manager'];
const KEY = 'coldchain.role';

function readStored() {
  try { const r = localStorage.getItem(KEY); return ROLES.includes(r) ? r : 'analyst'; } catch { return 'analyst'; }
}

const Ctx = createContext({ role: 'analyst', setRole: () => {} });

export function RoleProvider({ children }) {
  const [role, setRoleState] = useState(readStored);
  setApiRole(role);
  useEffect(() => { try { localStorage.setItem(KEY, role); } catch { /* storage unavailable */ } }, [role]);
  return <Ctx.Provider value={{ role, setRole: setRoleState }}>{children}</Ctx.Provider>;
}

export const useRole = () => useContext(Ctx);
