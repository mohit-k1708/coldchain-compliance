import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiPost, useApi } from '../api.js';
import { useRole } from '../RoleContext.jsx';
import Loading from '../components/Loading.jsx';
import ErrorBox from '../components/ErrorBox.jsx';
import Table from '../components/Table.jsx';
import Timeline from '../components/Timeline.jsx';
import SeverityBadge from '../components/SeverityBadge.jsx';
import { allowedNext, missingFields, newEventId, requiredFields } from '../lib/workflow.js';
import { formatDateTime, formatDuration, formatTemp } from '../lib/format.js';

const LABELS = { analyst: 'Analyst (required)', note: 'Note (required)', resolution: 'Resolution (required)' };

function ActionPanel({ exception, onDone }) {
  const { role } = useRole();
  const options = allowedNext(exception.status);
  const [to, setTo] = useState('');
  const [form, setForm] = useState({ analyst: '', note: '', resolution: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState('');
  const target = options.includes(to) ? to : options[0];

  if (options.length === 0) return <p className="empty">This exception is {exception.status}: no further transitions are allowed.</p>;
  const need = requiredFields(target);

  async function submit(e) {
    e.preventDefault();
    setOk('');
    const missing = missingFields(target, form);
    if (missing.length) { setErr({ status: 0, code: 'VALIDATION_ERROR', message: `Please fill in: ${missing.join(', ')}.` }); return; }
    setBusy(true); setErr(null);
    try {
      const body = { event_id: newEventId(), to_status: target };
      for (const k of ['analyst', 'note', 'resolution']) if (form[k].trim()) body[k] = form[k].trim();
      const out = await apiPost(`/api/exceptions/${exception.excursion_id}/transition`, body);
      setOk(out.duplicate ? 'Already recorded (duplicate event).' : `Moved to ${target}.`);
      setForm({ analyst: '', note: '', resolution: '' });
      onDone();
    } catch (x) { setErr(x); } finally { setBusy(false); }
  }

  return (
    <form className="action-panel" onSubmit={submit}>
      <p>Acting as <strong>{role}</strong>. Legal next states from {exception.status}: <strong>{options.join(', ')}</strong>.</p>
      <label>Move to
        <select value={target} onChange={(e) => { setTo(e.target.value); setErr(null); }}>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
      {need.map((k) => (
        <label key={k}>{LABELS[k]}
          {k === 'analyst' ? <input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /> : <textarea rows={2} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />}
        </label>
      ))}
      {!need.includes('note') && <label>Note (optional)<textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>}
      <button type="submit" disabled={busy}>{busy ? 'Submitting...' : `Move to ${target}`}</button>
      <ErrorBox error={err} />
      {ok && <p className="success" role="status">{ok}</p>}
    </form>
  );
}

export default function ExceptionDetail() {
  const { id } = useParams();
  const { data, error, loading, reload } = useApi(`/api/exceptions/${id}`);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const { exception: e, history, evidence_readings: ev, evidence_count: evN } = data;
  return (
    <div>
      <p><Link to="/exceptions">&larr; All exceptions</Link></p>
      <h2>Exception {e.excursion_id}</h2>
      <dl className="facts">
        <dt>Issue type</dt><dd>{e.issue_type}</dd>
        <dt>Shipment</dt><dd><Link to={`/shipments/${e.shipment_id}`}>{e.shipment_id}</Link></dd>
        <dt>Severity</dt><dd><SeverityBadge severity={e.severity} /></dd>
        <dt>Status</dt><dd><span className={`badge st-${e.status.toLowerCase()}`}>{e.status}</span></dd>
        <dt>Source</dt><dd>{e.source}</dd>
        <dt>Period</dt><dd>{formatDateTime(e.start_time)} to {formatDateTime(e.end_time)} ({formatDuration(e.duration_minutes)})</dd>
        <dt>Peak</dt><dd>{formatTemp(e.peak_temperature_c)}</dd>
        <dt>Detected</dt><dd>{formatDateTime(e.detected_at)}</dd>
        <dt>Logger / policy / run</dt><dd>{e.logger_id ?? '-'} / {e.policy_id ?? '-'} / {e.compliance_run_id ?? '-'}</dd>
        <dt>Analyst</dt><dd>{e.assigned_analyst ?? '-'}</dd>
        <dt>Resolution</dt><dd>{e.resolution ?? '-'} {e.resolved_at ? `(${formatDateTime(e.resolved_at)})` : ''}</dd>
        <dt>Evidence reference</dt><dd>{e.evidence_reference ?? '-'}</dd>
      </dl>

      <section>
        <h3>Workflow action</h3>
        <ActionPanel key={e.status} exception={e} onDone={reload} />
      </section>

      <section>
        <h3>History</h3>
        <Timeline
          empty="No workflow events yet (still OPEN as detected)."
          items={history.map((h) => ({ key: h.exception_event_id, at: h.occurred_at, title: `${h.from_status ?? 'new'} → ${h.to_status}${h.analyst ? ` (analyst ${h.analyst})` : ''}`, detail: h.note ?? undefined }))}
        />
      </section>

      <section>
        <h3>Evidence readings ({evN})</h3>
        <Table
          rowKey={(r) => r.reading_id}
          rows={ev}
          empty="No evidence readings are linked to this exception."
          columns={[
            { key: 'reading_id', header: 'Reading' },
            { key: 'recorded_at', header: 'Recorded at', render: (r) => formatDateTime(r.recorded_at) },
            { key: 'temperature_c', header: 'Temperature', render: (r) => formatTemp(r.temperature_c) },
            { key: 'calibration_uncertainty_c', header: '± uncertainty', render: (r) => (r.calibration_uncertainty_c ?? '-') },
            { key: 'reading_quality', header: 'Quality' },
          ]}
        />
        {evN > ev.length && <p className="note">Showing the first {ev.length} of {evN} readings.</p>}
      </section>
    </div>
  );
}
