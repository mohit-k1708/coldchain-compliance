export default function Pagination({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="pagination">
      <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1}>Previous</button>
      <span>{from}-{to} of {total} (page {page} of {pages})</span>
      <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pages}>Next</button>
    </div>
  );
}
