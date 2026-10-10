import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import ClockPanel from './components/ClockPanel'
import Dashboard from './components/Dashboard'
import DonorView from './components/DonorView'
import VolunteerView from './components/VolunteerView'
import './App.css'

function App() {
  const [data, setData] = useState(null) // everything the backend knows
  const [loadError, setLoadError] = useState(null)
  const [actor, setActor] = useState('D1') // "who am I acting as" (no login)
  const [toast, setToast] = useState(null) // success message after an action

  const refresh = useCallback(async () => {
    setData(await api.getState())
  }, [])

  // Load the data once when the page opens
  useEffect(() => {
    api
      .getState()
      .then(setData)
      .catch(() => setLoadError('Cannot reach the backend. Is it running on port 3001?'))
  }, [])

  // Hide the success message after a few seconds
  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(timer)
  }, [toast])

  // Runs one API call, reloads the data, and returns the error (or null on success).
  // If a success message is given, it is shown after a successful call.
  const act = useCallback(
    async (fn, successMessage) => {
      try {
        await fn(api)
        await refresh()
        if (successMessage) setToast(successMessage)
        return null
      } catch (error) {
        await refresh().catch(() => {})
        return error
      }
    },
    [refresh],
  )

  if (loadError) return <p className="error page-error" role="alert">{loadError}</p>
  if (!data) {
    return (
      <div className="app" aria-busy="true">
        <p className="hint loading">Loading SurplusLink…</p>
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
    )
  }

  const donor = data.donors.find((d) => d.id === actor)
  const volunteer = data.volunteers.find((v) => v.id === actor)
  const role = donor ? 'donor' : 'volunteer'

  const switchRole = (next) => {
    if (next === role) return
    const first = next === 'donor' ? data.donors[0] : data.volunteers[0]
    if (first) setActor(first.id)
  }

  return (
    <div className="app">
      <header>
        <div>
          <h1>SurplusLink</h1>
          <p className="tagline">Connecting surplus food with the people who collect it</p>
        </div>
        <div className="actor">
          <div className="segmented" role="group" aria-label="Choose role">
            <button
              type="button"
              className={role === 'donor' ? 'active' : ''}
              aria-pressed={role === 'donor'}
              onClick={() => switchRole('donor')}
            >
              Donor
            </button>
            <button
              type="button"
              className={role === 'volunteer' ? 'active' : ''}
              aria-pressed={role === 'volunteer'}
              onClick={() => switchRole('volunteer')}
            >
              Volunteer
            </button>
          </div>
          <select aria-label="Acting as" value={actor} onChange={(e) => setActor(e.target.value)}>
            {role === 'donor'
              ? data.donors.map((d) => (
                  <option key={d.id} value={d.id}>{d.name} ({d.zone})</option>
                ))
              : data.volunteers.map((v) => (
                  <option key={v.id} value={v.id}>{v.name} ({v.zones.join('/')}, {v.capacity_kg} kg)</option>
                ))}
          </select>
        </div>
      </header>

      {toast && (
        <div className="toast" role="status">
          <span>✔ {toast}</span>
          <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => setToast(null)}>×</button>
        </div>
      )}

      <Dashboard dashboard={data.dashboard} />

      <main>
        <div className="left">
          {donor && <DonorView data={data} donor={donor} act={act} />}
          {volunteer && <VolunteerView data={data} volunteer={volunteer} act={act} />}
        </div>
        <div className="right">
          <ClockPanel clock={data.clock} act={act} />
        </div>
      </main>
    </div>
  )
}

export default App
