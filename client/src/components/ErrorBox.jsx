export default function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="error-box" role="alert">
      <strong>{error.status ? `Error ${error.status}` : 'Error'}{error.code ? ` (${error.code})` : ''}:</strong> {error.message}
      {onRetry && <> <button type="button" onClick={onRetry}>Retry</button></>}
    </div>
  );
}
