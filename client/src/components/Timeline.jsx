import { formatDateTime } from '../lib/format.js';

// items: [{key, at, title, detail?}] in chronological order
export default function Timeline({ items, empty = 'No events.' }) {
  if (!items || items.length === 0) return <p className="empty">{empty}</p>;
  return (
    <ol className="timeline">
      {items.map((it) => (
        <li key={it.key}>
          <span className="timeline-time">{formatDateTime(it.at)}</span>
          <span className="timeline-title">{it.title}</span>
          {it.detail && <span className="timeline-detail">{it.detail}</span>}
        </li>
      ))}
    </ol>
  );
}
