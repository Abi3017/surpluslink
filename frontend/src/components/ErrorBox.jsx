// Shows a refusal from the backend, including EVERY violated rule.
export default function ErrorBox({ error }) {
  if (!error) return null
  const items = [
    ...(error.violations || []).map((v) => (v.rule ? `Rule ${v.rule}: ${v.message}` : v.message)),
    ...(error.errors || []),
  ]
  return (
    <div className="error" role="alert">
      <strong>{error.message}</strong>
      {items.length > 0 && (
        <ul>
          {items.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
