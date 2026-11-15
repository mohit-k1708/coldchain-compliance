export default function SeverityBadge({ severity }) {
  if (!severity) return <span>-</span>;
  return <span className={`badge sev-${severity.toLowerCase()}`}>{severity}</span>;
}
