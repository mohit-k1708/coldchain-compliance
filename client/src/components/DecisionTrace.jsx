import { ruleName } from '../lib/format.js';
import StatusBadge from './StatusBadge.jsx';

export default function DecisionTrace({ findings }) {
  if (!findings || findings.length === 0) return <p className="empty">No findings (shipment not evaluated yet).</p>;
  return (
    <ul className="trace">
      {findings.map((f) => (
        <li key={f.finding_id} className="trace-item">
          <div className="trace-head">
            <strong>{f.rule_code}</strong> <span>{ruleName(f.rule_code)}</span> <StatusBadge status={f.result} />
            <span className="muted"> · {f.evidence_count} evidence reading{f.evidence_count === 1 ? '' : 's'}</span>
          </div>
          <div className="trace-detail">{f.detail || '-'}</div>
          {f.evidence_count > 0 && (
            <details>
              <summary>Reading IDs (first {Math.min(50, f.evidence_reading_ids.length)} of {f.evidence_count})</summary>
              <p className="ids">{f.evidence_reading_ids.join(', ')}</p>
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}
