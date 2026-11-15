import { Link, useSearchParams } from 'react-router-dom';
import { useApi } from '../api.js';
import Loading from '../components/Loading.jsx';
import ErrorBox from '../components/ErrorBox.jsx';
import Table from '../components/Table.jsx';
import Pagination from '../components/Pagination.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

const COMPLIANCE = ['COMPLIANT', 'NON_COMPLIANT', 'INDETERMINATE'];
const SHIP = ['PLANNED', 'PACKED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'];

export default function Shipments() {
  const [sp, setSp] = useSearchParams();
  const f = { status: sp.get('status') ?? '', shipmentStatus: sp.get('shipmentStatus') ?? '', productId: sp.get('productId') ?? '', q: sp.get('q') ?? '', sort: sp.get('sort') ?? 'id', page: Number(sp.get('page') ?? 1) || 1 };
  const set = (patch) => {
    const next = { ...f, page: 1, ...patch };
    const p = {};
    for (const [k, v] of Object.entries(next)) if (v !== '' && v !== undefined && !(k === 'page' && v === 1) && !(k === 'sort' && v === 'id')) p[k] = String(v);
    setSp(p);
  };
  const dash = useApi('/api/dashboard'); // product list for the filter
  const products = [...new Map((dash.data?.by_product ?? []).map((r) => [r.product_id, r.product_name])).entries()];
  const { data, error, loading, reload } = useApi('/api/shipments', { status: f.status, shipmentStatus: f.shipmentStatus, productId: f.productId, q: f.q, sort: f.sort, page: f.page, pageSize: 25 });
  const onSort = (key) => set({ sort: f.sort === key ? `-${key}` : key, page: f.page });

  return (
    <div>
      <h2>Shipments</h2>
      <form className="filters" onSubmit={(e) => e.preventDefault()}>
        <label>Compliance
          <select value={f.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="">All</option>{COMPLIANCE.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>Shipment status
          <select value={f.shipmentStatus} onChange={(e) => set({ shipmentStatus: e.target.value })}>
            <option value="">All</option>{SHIP.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>Product
          <select value={f.productId} onChange={(e) => set({ productId: e.target.value })}>
            <option value="">All</option>{products.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label>Shipment ID starts with
          <input type="search" value={f.q} placeholder="SHP-2026-0000" onChange={(e) => set({ q: e.target.value })} />
        </label>
        <button type="button" onClick={() => setSp({})}>Clear filters</button>
      </form>
      {loading && <Loading />}
      <ErrorBox error={error} onRetry={reload} />
      {data && !loading && (
        <>
          <Table
            rowKey={(r) => r.id}
            rows={data.items}
            empty="No shipments match these filters."
            sort={{ value: f.sort, onSort }}
            columns={[
              { key: 'id', header: 'Shipment ID', sortKey: 'id', render: (r) => <Link to={`/shipments/${r.id}`}>{r.id}</Link> },
              { key: 'product', header: 'Product' },
              { key: 'lots', header: 'Lot(s)', render: (r) => (r.lot_ids.length ? r.lot_ids.join(', ') : '-') },
              { key: 'origin_location', header: 'Origin' },
              { key: 'destination_location', header: 'Destination' },
              { key: 'logger_id', header: 'Assigned logger', render: (r) => r.logger_id ?? 'none' },
              { key: 'shipment_status', header: 'Shipment status' },
              { key: 'compliance_status', header: 'Compliance status', sortKey: 'status', render: (r) => <StatusBadge status={r.compliance_status ?? 'NOT_EVALUATED'} /> },
              { key: 'reason_summary', header: 'Reason', render: (r) => r.reason_summary ?? '-' },
            ]}
          />
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set({ page: p })} />
        </>
      )}
    </div>
  );
}
