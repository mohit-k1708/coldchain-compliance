import { NavLink, Route, Routes } from 'react-router-dom';
import { ROLES, useRole } from './RoleContext.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Shipments from './pages/Shipments.jsx';
import ShipmentDetail from './pages/ShipmentDetail.jsx';
import Exceptions from './pages/Exceptions.jsx';
import ExceptionDetail from './pages/ExceptionDetail.jsx';
import Evaluation from './pages/Evaluation.jsx';

export default function App() {
  const { role, setRole } = useRole();
  return (
    <div className="app">
      <header className="header">
        <h1 className="brand">Cold-chain compliance</h1>
        <nav className="nav" aria-label="Main">
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/shipments">Shipments</NavLink>
          <NavLink to="/exceptions">Exceptions</NavLink>
          <NavLink to="/evaluation">Evaluation</NavLink>
        </nav>
        <label className="role-switch">
          Role{' '}
          <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Simulated role">
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
      </header>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/shipments" element={<Shipments />} />
          <Route path="/shipments/:id" element={<ShipmentDetail />} />
          <Route path="/exceptions" element={<Exceptions />} />
          <Route path="/exceptions/:id" element={<ExceptionDetail />} />
          <Route path="/evaluation" element={<Evaluation />} />
          <Route path="*" element={<p className="empty">Page not found.</p>} />
        </Routes>
      </main>
      <footer className="footer">Roles are simulated for the demo (no authentication).</footer>
    </div>
  );
}
