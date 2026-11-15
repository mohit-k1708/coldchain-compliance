import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApi } from '../api.js';
import Loading from '../components/Loading.jsx';
import ErrorBox from '../components/ErrorBox.jsx';
import Table from '../components/Table.jsx';
import { formatNumber, ruleName } from '../lib/format.js';

const STATUS_COLORS = { COMPLIANT: '#2e7d32', NON_COMPLIANT: '#c62828', INDETERMINATE: '#b26a00' };
const SEV_ORDER = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const EXC_ORDER = ['OPEN', 'ASSIGNED', 'INVESTIGATING', 'ESCALATED', 'RESOLVED'];

function Kpi({ label, value, to }) {
  const body = (<><span className="kpi-value">{formatNumber(value)}</span><span className="kpi-label">{label}</span></>);
  return to ? <Link className="kpi" to={to}>{body}</Link> : <div className="kpi">{body}</div>;
}

function productRows(byProduct) {
  const map = new Map();
  for (const r of byProduct) {
    if (!map.has(r.product_id)) map.set(r.product_id, { product: r.product_name, COMPLIANT: 0, NON_COMPLIANT: 0, INDETERMINATE: 0 });
    map.get(r.product_id)[r.status] = r.n;
  }
  return [...map.values()];
}

export default function Dashboard() {
  const { data, error, loading, reload } = useApi('/api/dashboard');
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const d = data;
  const perProduct = productRows(d.by_product ?? []);
  const byStatus = EXC_ORDER.map((s) => ({ name: s, count: d.exceptions_by_status?.[s] ?? 0 }));
  const bySev = SEV_ORDER.map((s) => ({ name: s, count: d.exceptions_by_severity?.[s] ?? 0 }));
  return (
    <div>
      <h2>Dashboard</h2>
      <div className="kpis">
        <Kpi label="Total shipments" value={d.total_shipments} to="/shipments" />
        <Kpi label="Evaluated (delivered)" value={d.evaluated} to="/shipments?shipmentStatus=DELIVERED" />
        <Kpi label="COMPLIANT" value={d.compliant} to="/shipments?status=COMPLIANT" />
        <Kpi label="NON COMPLIANT" value={d.non_compliant} to="/shipments?status=NON_COMPLIANT" />
        <Kpi label="INDETERMINATE" value={d.indeterminate} to="/shipments?status=INDETERMINATE" />
        <Kpi label="Open exceptions" value={d.open_exceptions} to="/exceptions?status=OPEN" />
        <Kpi label="Temperature excursions" value={d.temperature_excursion_runs} to="/exceptions?issueType=TEMP_HIGH" />
        <Kpi label="Data gaps" value={d.data_gaps} to="/exceptions?issueType=MISSING_DATA" />
      </div>
      <p className="note">Open exceptions = engine exceptions not yet RESOLVED. Temperature excursions count TEMP_HIGH and TEMP_LOW exceptions; the KPI link opens TEMP_HIGH (filter one type at a time).</p>

      <section>
        <h3>Compliance status per product</h3>
        {perProduct.length === 0 ? <p className="empty">No evaluated shipments.</p> : (
          <div className="chart-box" style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={perProduct}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="product" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                {Object.keys(STATUS_COLORS).map((s) => <Bar key={s} dataKey={s} name={s.replace('_', ' ')} stackId="a" fill={STATUS_COLORS[s]} isAnimationActive={false} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <div className="grid-2">
        <section>
          <h3>Exceptions by status</h3>
          <div className="chart-box" style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byStatus}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="count" name="exceptions" fill="#44546a" isAnimationActive={false} /></BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section>
          <h3>Exceptions by severity</h3>
          <div className="chart-box" style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={bySev}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="count" name="exceptions" fill="#8a4f7d" isAnimationActive={false} /></BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section>
        <h3>Top reasons (current runs)</h3>
        <Table
          rows={d.top_reasons}
          rowKey={(r) => r.rule ?? 'none'}
          empty="No reasons."
          columns={[
            { key: 'rule', header: 'Rule code', render: (r) => r.rule || '(none: compliant)' },
            { key: 'name', header: 'Meaning', render: (r) => (r.rule ? ruleName(r.rule) : 'No rule failed or was indeterminate') },
            { key: 'n', header: 'Shipments', render: (r) => formatNumber(r.n) },
          ]}
        />
      </section>
    </div>
  );
}
