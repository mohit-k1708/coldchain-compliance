// columns: [{key, header, render?(row), sortKey?}]; sort = {value, onSort(key)} where value like "id" or "-id".
export default function Table({ columns, rows, empty = 'No rows.', rowKey, sort, caption }) {
  if (!rows || rows.length === 0) return <p className="empty">{empty}</p>;
  return (
    <div className="table-wrap">
      <table>
        {caption && <caption>{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort && c.sortKey && (sort.value === c.sortKey || sort.value === `-${c.sortKey}`);
              const dir = active ? (sort.value.startsWith('-') ? ' ▼' : ' ▲') : '';
              return (
                <th key={c.key} scope="col" aria-sort={active ? (sort.value.startsWith('-') ? 'descending' : 'ascending') : undefined}>
                  {sort && c.sortKey ? <button type="button" className="link-button" onClick={() => sort.onSort(c.sortKey)}>{c.header}{dir}</button> : c.header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={rowKey ? rowKey(r, i) : i}>
              {columns.map((c) => <td key={c.key}>{c.render ? c.render(r) : (r[c.key] ?? '-')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
