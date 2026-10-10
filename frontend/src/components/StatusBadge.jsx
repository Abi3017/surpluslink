// One badge for every status, so the colours are the same everywhere (see .badge.* in App.css).
export default function StatusBadge({ status, label }) {
  return <span className={`badge ${status}`}>{label || status.replace('_', ' ')}</span>
}
