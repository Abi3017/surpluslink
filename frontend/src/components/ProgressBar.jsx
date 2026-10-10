// Shows how much of a donation is already claimed (total - remaining) out of the total.
export default function ProgressBar({ total, remaining }) {
  const claimed = Math.max(0, total - remaining)
  const percent = total > 0 ? Math.round((claimed / total) * 100) : 0
  return (
    <div className="progress-wrap">
      <div
        className="progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={claimed}
        aria-label="Claimed quantity"
      >
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <span className="progress-text">
        {claimed} of {total} kg claimed · {remaining} kg available
      </span>
    </div>
  )
}
