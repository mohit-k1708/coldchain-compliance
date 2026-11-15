// Always shows the status as TEXT (plus a symbol and a colour class); never colour alone.
const SYMBOL = { COMPLIANT: '✔', NON_COMPLIANT: '✖', INDETERMINATE: '?', PASS: '✔', FAIL: '✖', WARN: '!', INFO: 'i', SKIPPED: '-', NOT_EVALUATED: '-' };

export default function StatusBadge({ status, big = false }) {
  const s = status ?? 'NOT_EVALUATED';
  return <span className={`badge badge-${String(s).toLowerCase()}${big ? ' badge-big' : ''}`}><span aria-hidden="true">{SYMBOL[s] ?? '•'} </span>{String(s).replace(/_/g, ' ')}</span>;
}
