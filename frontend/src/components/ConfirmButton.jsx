import { useState } from 'react'

// A red button that first asks "Are you sure?". onConfirm only runs after "Yes".
// While it runs, both buttons are disabled so it cannot be submitted twice.
export default function ConfirmButton({ label, question, onConfirm, disabled }) {
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)

  const confirm = async () => {
    if (busy) return
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      setBusy(false)
      setAsking(false)
    }
  }

  if (!asking) {
    return (
      <button type="button" className="danger" disabled={disabled} onClick={() => setAsking(true)}>
        {label}
      </button>
    )
  }

  return (
    <span className="confirm" role="alertdialog" aria-label={question}>
      <span className="confirm-text">{question}</span>
      <button type="button" className="danger" disabled={busy} onClick={confirm}>
        {busy ? 'Cancelling…' : 'Yes, cancel'}
      </button>
      <button type="button" className="secondary" disabled={busy} onClick={() => setAsking(false)}>
        Keep it
      </button>
    </span>
  )
}
