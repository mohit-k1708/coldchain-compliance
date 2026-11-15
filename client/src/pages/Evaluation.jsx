import { useApi } from '../api.js';
import Loading from '../components/Loading.jsx';
import ErrorBox from '../components/ErrorBox.jsx';
import Table from '../components/Table.jsx';
import { formatNumber, formatPercent } from '../lib/format.js';

const CLASSES = ['COMPLIANT', 'NON_COMPLIANT', 'INDETERMINATE'];
const RATE_TITLES = {
  false_positive_rate: 'False positive rate (compliant flagged)', missed_excursion_rate: 'Missed excursion rate', missing_data_detection_rate: 'Missing-data detection',
  silent_pass_detection_rate: 'Silent legacy PASS detection', custody_gap_detection_rate: 'Custody-gap detection', logger_mismatch_detection_rate: 'Logger mismatch detection',
  policy_mismatch_detection_rate: 'Policy mismatch detection', cross_shipment_isolation_rate: 'Cross-shipment isolation', route_deviation_detection_rate: 'Route deviation detection',
};

function Confusion({ cm, title }) {
  const max = Math.max(1, ...CLASSES.flatMap((a) => CLASSES.map((p) => cm[a][p])));
  return (
    <div className="table-wrap">
      <table className="confusion">
        <caption>{title}: rows = expected decision, columns = engine/baseline status</caption>
        <thead><tr><th scope="col">expected \ actual</th>{CLASSES.map((c) => <th key={c} scope="col">{c.replace('_', ' ')}</th>)}</tr></thead>
        <tbody>
          {CLASSES.map((a) => (
            <tr key={a}>
              <th scope="row">{a.replace('_', ' ')}</th>
              {CLASSES.map((p) => {
                const n = cm[a][p];
                const diag = a === p;
                return <td key={p} className="num" style={{ background: n === 0 ? 'transparent' : `${diag ? 'rgba(46,125,50,' : 'rgba(198,40,40,'}${0.12 + 0.6 * (n / max)})` }}>{formatNumber(n)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Run({ run, label }) {
  const m = run.metrics;
  return (
    <section className="eval-run">
      <h3>{label}: {run.name}</h3>
      <p className="muted">{run.description}</p>
      <div className="kpis">
        <div className="kpi"><span className="kpi-value">{formatPercent(m.accuracy, 2)}</span><span className="kpi-label">Overall accuracy (n = {formatNumber(m.n)})</span></div>
        <div className="kpi"><span className="kpi-value">{m.macro_f1 === null ? 'N/A' : m.macro_f1.toFixed(4)}</span><span className="kpi-label">Macro-F1</span></div>
      </div>
      <Confusion cm={m.confusion} title="Confusion matrix" />

      <h4>Detection per injected issue type</h4>
      <Table
        rowKey={(r) => r.label}
        rows={Object.entries(m.per_label).map(([label, o]) => ({ label, ...o }))}
        columns={[
          { key: 'label', header: 'Issue type' }, { key: 'count', header: 'Count' }, { key: 'detected', header: 'Detected' },
          { key: 'correct_status', header: 'Correct status' }, { key: 'detection_rate', header: 'Detection rate', render: (r) => formatPercent(r.detection_rate, 2) },
        ]}
      />

      <h4>Named rates</h4>
      <Table
        rowKey={(r) => r.key}
        rows={Object.entries(m.named_rates).map(([key, o]) => ({ key, ...o }))}
        columns={[
          { key: 'title', header: 'Rate', render: (r) => RATE_TITLES[r.key] ?? r.key }, { key: 'num', header: 'Numerator' }, { key: 'den', header: 'Denominator' },
          { key: 'rate', header: 'Rate', render: (r) => formatPercent(r.rate, 2) },
        ]}
      />

      {run.naive && (
        <>
          <h4>Naive baseline vs engine</h4>
          <Table
            rowKey={(r) => r.name}
            rows={[{ name: 'Engine', accuracy: m.accuracy, f1: m.macro_f1 }, { name: 'Naive baseline', accuracy: run.naive.accuracy, f1: run.naive.macro_f1 }]}
            columns={[{ key: 'name', header: 'System' }, { key: 'accuracy', header: 'Accuracy', render: (r) => formatPercent(r.accuracy, 2) }, { key: 'f1', header: 'Macro-F1', render: (r) => (r.f1 === null ? 'N/A' : r.f1.toFixed(4)) }]}
          />
          <Confusion cm={run.naive.confusion} title="Naive baseline confusion matrix" />
          <Table
            caption="Per issue type: naive baseline correct-status rate"
            rowKey={(r) => r.label}
            rows={Object.entries(run.naive.per_label).map(([label, o]) => ({ label, ...o }))}
            columns={[{ key: 'label', header: 'Issue type' }, { key: 'count', header: 'Count' }, { key: 'correct', header: 'Naive correct' }, { key: 'rate', header: 'Naive correct rate', render: (r) => formatPercent(r.correct / r.count, 1) }]}
          />
        </>
      )}
    </section>
  );
}

export default function Evaluation() {
  const { data, error, loading, reload } = useApi('/api/evaluation');
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data || !data.primary) return <p className="empty">No evaluation results are available.</p>;
  return (
    <div>
      <h2>Evaluation against ground truth</h2>
      <p className="note">Read-only. Metrics compare engine statuses with the separately stored ground truth; the engine never reads it.</p>
      <Run run={data.primary} label="Primary run" />
      {data.holdout ? (
        <>
          <Run run={data.holdout} label="Holdout run" />
          <p className="muted">{data.holdout.disagreements}</p>
        </>
      ) : <p className="empty">No holdout run present.</p>}

      <section>
        <h3>Ablation: disable one rule group</h3>
        <Table
          rowKey={(r) => r.rule}
          rows={data.ablation ?? []}
          empty="No ablation results."
          columns={[
            { key: 'rule', header: 'Rule disabled' }, { key: 'accuracy', header: 'Accuracy', render: (r) => formatPercent(r.accuracy, 2) },
            { key: 'delta', header: 'Change', render: (r) => `${r.accuracy_delta >= 0 ? '+' : ''}${(r.accuracy_delta * 100).toFixed(2)} pp` },
            { key: 'changes', header: 'Collapsed labels', render: (r) => r.changes.map((c) => `${c.label} ${formatPercent(c.from, 0)} → ${formatPercent(c.to, 0)}`).join('; ') || '(none)' },
            { key: 'hits', header: 'Hits intended label', render: (r) => (r.hits_intended ? 'yes' : 'NO') },
          ]}
        />
      </section>

      {data.oracle && <section><h3>Oracle check</h3><p>{data.oracle}</p></section>}

      <section>
        <h3>Limitations</h3>
        {data.limitations?.length ? <ul>{data.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul> : <p className="empty">No limitations text in the report; re-run <code>npm run metrics</code>.</p>}
      </section>
    </div>
  );
}
