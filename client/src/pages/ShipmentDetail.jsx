import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiPost, useApi } from '../api.js';
import { useRole } from '../RoleContext.jsx';
import Loading from '../components/Loading.jsx';
import ErrorBox from '../components/ErrorBox.jsx';
import Table from '../components/Table.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import SeverityBadge from '../components/SeverityBadge.jsx';
import TemperatureChart from '../components/TemperatureChart.jsx';
import DecisionTrace from '../components/DecisionTrace.jsx';
import Timeline from '../components/Timeline.jsx';
import { formatDateTime, formatDuration, formatTemp } from '../lib/format.js';

const CONFLICT_RULES = ['R-SILENT-01', 'R-ISO-01'];

function Card({ title, children }) {
  return <div className="card"><h4>{title}</h4>{children}</div>;
}

function PolicyPanel({ applied, used }) {
  const p = used ?? applied;
  if (!p) return <p className="empty">No policy information.</p>;
  const differs = applied && used && applied.policy_id !== used.policy_id;
  return (
    <div>
      {differs && (
        <div className="warn-box" role="alert">
          Policy mismatch: the shipment was assigned policy <strong>{applied.policy_id}</strong> (v{applied.policy_version}), but the evaluation used <strong>{used.policy_id}</strong> (v{used.policy_version}).
        </div>
      )}
      <dl className="facts">
        <dt>Policy (used)</dt><dd>{p.policy_id}, version {p.policy_version}</dd>
        <dt>Permitted range</dt><dd>{p.min_temp_c} to {p.max_temp_c} °C</dd>
        <dt>Allowed excursion</dt><dd>{formatDuration(p.max_excursion_minutes)}</dd>
        <dt>Gap limit</dt><dd>{formatDuration(p.max_data_gap_minutes)}</dd>
        <dt>Dwell limit</dt><dd>{formatDuration(p.max_dwell_minutes)}</dd>
        <dt>Effective</dt><dd>{formatDateTime(p.effective_from)} to {p.effective_to ? formatDateTime(p.effective_to) : 'open-ended'}</dd>
      </dl>
    </div>
  );
}

function ReEvaluate({ shipmentId, onDone }) {
  const { role } = useRole();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState(null);
  const allowed = role === 'analyst';
  async function go() {
    setBusy(true); setErr(null); setMsg('');
    try {
      const out = await apiPost(`/api/shipments/${shipmentId}/evaluate`, {});
      setMsg(out.created ? `New run created: ${out.run.compliance_run_id} (${out.run.compliance_status}).` : `No new run: the inputs are unchanged (${out.run.compliance_run_id} stays current).`);
      onDone();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  }
  return (
    <div className="reeval">
      <button type="button" onClick={go} disabled={!allowed || busy}>{busy ? 'Evaluating...' : 'Re-evaluate'}</button>
      {!allowed && <span className="hint"> Only the analyst role can re-evaluate (current role: {role}).</span>}
      {msg && <p className="success" role="status">{msg}</p>}
      <ErrorBox error={err} />
    </div>
  );
}

export default function ShipmentDetail() {
  const { id } = useParams();
  const detail = useApi(`/api/shipments/${id}`);
  const readings = useApi(`/api/shipments/${id}/readings`);
  const report = useApi(`/api/shipments/${id}/report`); // best effort: arithmetic, route and custody flags
  const reloadAll = () => { detail.reload(); readings.reload(); report.reload(); };

  if (detail.loading && !detail.data) return <Loading />;
  if (detail.error) return <ErrorBox error={detail.error} onRetry={detail.reload} />;
  const d = detail.data;
  const s = d.shipment, run = d.compliance_run, rep = report.data;
  const reportBase = `/api/shipments/${id}/report`;
  const tempExc = d.exceptions.filter((e) => e.issue_type === 'TEMP_HIGH' || e.issue_type === 'TEMP_LOW');
  const conflict = d.findings.some((f) => CONFLICT_RULES.includes(f.rule_code) && f.result !== 'PASS');
  const asg = d.logger_assignments;
  const route = rep?.route;
  const custody = rep?.custody;

  return (
    <div>
      <p><Link to="/shipments">&larr; All shipments</Link></p>
      <header className="detail-head">
        <h2>{s.shipment_id}</h2>
        <StatusBadge big status={run?.compliance_status ?? 'NOT_EVALUATED'} />
        <p className="reason">{run ? run.reason_summary : `Not evaluated (shipment status ${s.shipment_status}).`}</p>
        <p className="muted">{run ? <>Run {run.compliance_run_id} · as of {formatDateTime(run.run_at)} · {run.engine_version}</> : null}</p>
        <div className="actions">
          <a className="btn" href={`${reportBase}?format=html`} target="_blank" rel="noreferrer">Report (HTML)</a>
          <a className="btn" href={`${reportBase}?format=md`} target="_blank" rel="noreferrer">Report (Markdown)</a>
          <a className="btn" href={`${reportBase}?format=json`} target="_blank" rel="noreferrer">Report (JSON)</a>
        </div>
        <ReEvaluate shipmentId={id} onDone={reloadAll} />
      </header>

      <section>
        <h3>Temperature evidence</h3>
        {readings.loading && <Loading />}
        <ErrorBox error={readings.error} onRetry={readings.reload} />
        {readings.data && <TemperatureChart payload={readings.data} />}
      </section>

      <section>
        <h3>Policy</h3>
        <PolicyPanel applied={d.applied_policy} used={d.policy_used} />
      </section>

      <section>
        <h3>Decision trace</h3>
        <DecisionTrace findings={d.findings} />
      </section>

      <section>
        <h3>Temperature excursions</h3>
        {rep?.temperature?.arithmetic && <p className="arith">{rep.temperature.arithmetic}</p>}
        <Table
          rowKey={(r) => r.excursion_id}
          rows={tempExc}
          empty="No temperature excursions were recorded for this shipment."
          columns={[
            { key: 'excursion_id', header: 'Exception', render: (r) => <Link to={`/exceptions/${r.excursion_id}`}>{r.excursion_id}</Link> },
            { key: 'start_time', header: 'Start (inferred)', render: (r) => formatDateTime(r.start_time) },
            { key: 'end_time', header: 'End (inferred)', render: (r) => formatDateTime(r.end_time) },
            { key: 'duration_minutes', header: 'Duration', render: (r) => formatDuration(r.duration_minutes) },
            { key: 'peak_temperature_c', header: 'Peak', render: (r) => formatTemp(r.peak_temperature_c) },
            { key: 'severity', header: 'Severity', render: (r) => <SeverityBadge severity={r.severity} /> },
          ]}
        />
      </section>

      <section>
        <h3>Context</h3>
        <div className="cards">
          <Card title="Product">
            <p>{d.product.product_name} ({d.product.product_id})</p>
            <p className="muted">{d.product.category}; required {d.product.required_min_temp_c} to {d.product.required_max_temp_c} °C</p>
          </Card>
          <Card title="Lots">
            {d.lots.length === 0 ? <p className="empty">No lots.</p> : <ul>{d.lots.map((l) => <li key={l.lot_id}>{l.lot_id}: {l.quantity_units} units, {l.lot_status}, expires {l.expiry_date}</li>)}</ul>}
          </Card>
          <Card title="Packaging">
            {d.packaging.length === 0 ? <p className="empty">No packaging recorded.</p> : <ul>{d.packaging.map((p) => <li key={p.packaging_id}>{p.packaging_id}: {p.packaging_type}, {p.min_supported_temp_c} to {p.max_supported_temp_c} °C, qualified {p.qualified_duration_hours} h</li>)}</ul>}
          </Card>
          <Card title="Logger and calibration">
            {asg.length === 0 ? <p className="empty">No logger assigned.</p> : (
              <ul>{asg.map((a) => (
                <li key={a.logger_assignment_id}>
                  {a.logger_id} ({a.assignment_status}), window {formatDateTime(a.assigned_from)} to {formatDateTime(a.assigned_to)}
                  <br /><span className="muted">{a.calibrations.length ? a.calibrations.map((c) => `calibrated ${c.calibrated_on}, expires ${c.expires_on}, ± ${c.uncertainty_c} °C`).join('; ') : 'no calibration record'}</span>
                </li>))}
              </ul>
            )}
          </Card>
          <Card title="Origin and destination">
            <p>{s.origin_location} &rarr; {s.destination_location}</p>
            <p className="muted">Departure {formatDateTime(s.departure_time)} (planned {formatDateTime(s.planned_departure)})</p>
            <p className="muted">Arrival {formatDateTime(s.arrival_time)} (planned {formatDateTime(s.planned_arrival)})</p>
          </Card>
        </div>
      </section>

      <section>
        <h3>Route: planned vs actual</h3>
        {route ? (
          <Table
            rowKey={(r, i) => `${r.location}-${i}`}
            rows={route}
            empty="No route stops."
            columns={[
              { key: 'stop_sequence', header: 'Planned #' }, { key: 'actual_sequence', header: 'Actual #' }, { key: 'location', header: 'Location' }, { key: 'stop_type', header: 'Type' },
              { key: 'planned', header: 'Planned arrive / depart', render: (r) => `${formatDateTime(r.planned_arrival)} / ${formatDateTime(r.planned_departure)}` },
              { key: 'actual', header: 'Actual arrive / depart', render: (r) => `${formatDateTime(r.actual_arrival)} / ${formatDateTime(r.actual_departure)}` },
              { key: 'dwell_minutes', header: 'Dwell', render: (r) => formatDuration(r.dwell_minutes) },
              { key: 'flags', header: 'Deviation flags', render: (r) => (r.flags?.length ? r.flags.join(', ') : 'none') },
            ]}
          />
        ) : (
          <Table
            rowKey={(r) => r.route_stop_id}
            rows={d.route_stops}
            empty="No route stops."
            columns={[{ key: 'stop_sequence', header: 'Planned #' }, { key: 'actual_sequence', header: 'Actual #' }, { key: 'location', header: 'Location' }, { key: 'stop_type', header: 'Type' },
              { key: 'actual_arrival', header: 'Actual arrival', render: (r) => formatDateTime(r.actual_arrival) }, { key: 'actual_departure', header: 'Actual departure', render: (r) => formatDateTime(r.actual_departure) }]}
          />
        )}
      </section>

      <section>
        <h3>Custody chain</h3>
        {custody ? (
          <Table
            rowKey={(r) => r.event_sequence}
            rows={custody}
            empty="No custody events."
            columns={[
              { key: 'event_sequence', header: '#' }, { key: 'event_type', header: 'Event' }, { key: 'from', header: 'From' }, { key: 'to', header: 'To' },
              { key: 'event_timestamp', header: 'When', render: (r) => formatDateTime(r.event_timestamp) },
              { key: 'continuity', header: 'Continuity', render: (r) => (r.continuity === 'OK' ? 'OK' : `BROKEN: ${r.continuity}`) },
            ]}
          />
        ) : (
          <Timeline
            empty="No custody events."
            items={d.custody_events.map((c) => ({ key: c.custody_event_id, at: c.event_timestamp, title: `${c.event_type}: ${c.from_party_id} → ${c.to_party_id}`, detail: c.location ?? undefined }))}
          />
        )}
      </section>

      <section>
        <h3>Legacy reports</h3>
        {conflict && <p className="chip chip-warn">Conflict: a finding says the legacy report disagrees with the engine</p>}
        {d.legacy_reports.length === 0 && d.legacy_excursion_reports.length === 0 ? <p className="empty">No legacy reports.</p> : (
          <>
            <Table
              rowKey={(r) => r.legacy_report_id}
              rows={d.legacy_reports}
              empty="No legacy PASS/FAIL report."
              columns={[{ key: 'legacy_report_id', header: 'Report' }, { key: 'reported_status', header: 'Legacy status', render: (r) => <StatusBadge status={r.reported_status} /> },
                { key: 'reported_by', header: 'By' }, { key: 'reported_at', header: 'At', render: (r) => formatDateTime(r.reported_at) }]}
            />
            <Table
              rowKey={(r) => r.excursion_id}
              rows={d.legacy_excursion_reports}
              empty="No legacy excursion reports."
              columns={[{ key: 'excursion_id', header: 'Imported excursion' }, { key: 'issue_type', header: 'Type' }, { key: 'start_time', header: 'Start', render: (r) => formatDateTime(r.start_time) },
                { key: 'duration_minutes', header: 'Duration', render: (r) => formatDuration(r.duration_minutes) }, { key: 'severity', header: 'Severity', render: (r) => <SeverityBadge severity={r.severity} /> }]}
            />
          </>
        )}
      </section>

      <section>
        <h3>Run history</h3>
        <Table
          rowKey={(r) => r.compliance_run_id}
          rows={d.runs}
          empty="No runs yet."
          columns={[
            { key: 'compliance_run_id', header: 'Run' }, { key: 'run_at', header: 'As of', render: (r) => formatDateTime(r.run_at) },
            { key: 'compliance_status', header: 'Status', render: (r) => <StatusBadge status={r.compliance_status} /> },
            { key: 'current', header: 'Current', render: (r) => (r.is_current ? 'CURRENT' : 'superseded') },
            { key: 'reason_summary', header: 'Reason' },
          ]}
        />
      </section>

      <section>
        <h3>Exceptions of this shipment</h3>
        <Table
          rowKey={(r) => r.excursion_id}
          rows={d.exceptions}
          empty="No exceptions for this shipment."
          columns={[
            { key: 'excursion_id', header: 'Exception', render: (r) => <Link to={`/exceptions/${r.excursion_id}`}>{r.excursion_id}</Link> },
            { key: 'issue_type', header: 'Type' }, { key: 'severity', header: 'Severity', render: (r) => <SeverityBadge severity={r.severity} /> },
            { key: 'status', header: 'Status', render: (r) => <span className={`badge st-${r.status.toLowerCase()}`}>{r.status}</span> },
            { key: 'history', header: 'History events', render: (r) => r.history.length },
          ]}
        />
      </section>
    </div>
  );
}
