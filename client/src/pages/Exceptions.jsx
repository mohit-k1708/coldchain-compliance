import { Link, useSearchParams } from 'react-router-dom';
import { useApi } from '../api.js';
import Loading from '../components/Loading.jsx';
import ErrorBox from '../components/ErrorBox.jsx';
import Table from '../components/Table.jsx';
import Pagination from '../components/Pagination.jsx';
import SeverityBadge from '../components/SeverityBadge.jsx';
import { formatDateTime } from '../lib/format.js';
import { STATES } from '../lib/workflow.js';

const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const ISSUES = ['TEMP_HIGH', 'TEMP_LOW', 'MISSING_DATA', 'LOGGER_NOT_ASSIGNED', 'CALIBRATION_INVALID', 'ASSIGNMENT_OVERLAP', 'POLICY_MISMATCH', 'CUSTODY_GAP', 'ROUTE_DEVIATION', 'CROSS_SHIPMENT_REPORT', 'CALIBRATION_MARGINAL'];

export default function Exceptions() {
  const [sp, setSp] = useSearchParams();
  const f = { status: sp.get('status') ?? '', severity: sp.get('severity') ?? '', issueType: sp.get('issueType') ?? '', page: Number(sp.get('page') ?? 1) || 1 };
  const set = (patch) => {
    const next = { ...f, page: 1, ...patch };
    const p = {};
    for (const [k, v] of Object.entries(next)) if (v !== '' && !(k === 'page' && v === 1)) p[k] = String(v);
    setSp(p);
  };
  const { data, error, loading, reload } = useApi('/api/exceptions', { ...f, pageSize: 25 });
  return (
    <div>
      <h2>Exceptions</h2>
      <form className="filters" onSubmit={(e) => e.preventDefault()}>
        <label>Investigation status
          <select value={f.status} onChange={(e) => set({ status: e.target.value })}><option value="">All</option>{STATES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        </label>
        <label>Severity
          <select value={f.severity} onChange={(e) => set({ severity: e.target.value })}><option value="">All</option>{SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        </label>
        <label>Issue type
          <select value={f.issueType} onChange={(e) => set({ issueType: e.target.value })}><option value="">All</option>{ISSUES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        </label>
        <button type="button" onClick={() => setSp({})}>Clear filters</button>
      </form>
      {loading && <Loading />}
      <ErrorBox error={error} onRetry={reload} />
      {data && !loading && (
        <>
          <Table
            rowKey={(r) => r.excursion_id}
            rows={data.items}
            empty="No exceptions match these filters."
            columns={[
              { key: 'excursion_id', header: 'Exception ID', render: (r) => <Link to={`/exceptions/${r.excursion_id}`}>{r.excursion_id}</Link> },
              { key: 'issue_type', header: 'Type' },
              { key: 'shipment_id', header: 'Shipment', render: (r) => <Link to={`/shipments/${r.shipment_id}`}>{r.shipment_id}</Link> },
              { key: 'severity', header: 'Severity', render: (r) => <SeverityBadge severity={r.severity} /> },
              { key: 'detected_at', header: 'Detected', render: (r) => formatDateTime(r.detected_at) },
              { key: 'reason', header: 'Reason', render: (r) => (r.start_time ? `${r.issue_type} from ${formatDateTime(r.start_time)}${r.duration_minutes != null ? `, ${r.duration_minutes} min` : ''}` : r.issue_type) },
              { key: 'evidence_count', header: 'Evidence readings' },
              { key: 'status', header: 'Investigation status', render: (r) => <span className={`badge st-${r.status.toLowerCase()}`}>{r.status}</span> },
              { key: 'assigned_analyst', header: 'Analyst', render: (r) => r.assigned_analyst ?? '-' },
            ]}
          />
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set({ page: p })} />
        </>
      )}
    </div>
  );
}
