import { useState } from 'react'
import { addMinutes } from '../api'
import ErrorBox from './ErrorBox'

export default function ClockPanel({ clock, act }) {
  const [time, setTime] = useState(clock)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const move = async (target) => {
    if (busy) return
    setBusy(true)
    try {
      setError(await act((api) => api.setClock(target), `Clock moved to ${target.replace('T', ' ')}`))
      setTime(target)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card clock-card">
      <h2>Simulated clock</h2>
      <p className="clock" aria-live="polite">{clock.replace('T', ' ')}</p>
      <div className="row">
        <button className="secondary" disabled={busy} onClick={() => move(addMinutes(clock, 30))}>+30 min</button>
        <button className="secondary" disabled={busy} onClick={() => move(addMinutes(clock, 60))}>+1 hour</button>
        <button className="secondary" disabled={busy} onClick={() => move(addMinutes(clock, 1440))}>+1 day</button>
      </div>
      <div className="row">
        <input
          type="datetime-local"
          aria-label="Set clock to"
          value={time}
          disabled={busy}
          onChange={(e) => setTime(e.target.value)}
        />
        <button disabled={busy || !time} onClick={() => move(time)}>{busy ? 'Moving…' : 'Set clock'}</button>
      </div>
      <p className="hint">The clock can only move forward.</p>
      <ErrorBox error={error} />
    </section>
  )
}
