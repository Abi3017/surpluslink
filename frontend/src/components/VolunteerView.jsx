import { useState } from 'react'
import ConfirmButton from './ConfirmButton'
import ErrorBox from './ErrorBox'
import ProgressBar from './ProgressBar'
import StatusBadge from './StatusBadge'

const fmt = (t) => t.replace('T', ' ')

// One claim form per open donation, so each shows its own refusal reasons.
function ClaimForm({ donation, volunteer, clock, act }) {
  // Suggest a time inside the window and not before "now" (text comparison works for this format)
  const suggested = clock > donation.pickup_from ? clock : donation.pickup_from
  const [kg, setKg] = useState('')
  const [time, setTime] = useState(suggested)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const result = await act(
        (api) =>
          api.claim(donation.id, {
            volunteer_id: volunteer.id,
            kg: kg === '' ? null : Number(kg),
            planned_time: time,
          }),
        `Claim placed on ${donation.description}`,
      )
      setError(result)
      if (!result) setKg('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <form onSubmit={submit} className="row">
        <input type="number" min="1" step="1" placeholder="kg" aria-label="Kilograms to claim" value={kg}
          disabled={busy} onChange={(e) => setKg(e.target.value)} style={{ width: '5rem' }} />
        <input type="datetime-local" aria-label="Planned pickup time" value={time}
          disabled={busy} onChange={(e) => setTime(e.target.value)} />
        <button type="submit" disabled={busy}>{busy ? 'Claiming…' : 'Claim'}</button>
      </form>
      <ErrorBox error={error} />
    </>
  )
}

export default function VolunteerView({ data, volunteer, act }) {
  const [claimError, setClaimError] = useState(null)
  const [collectingId, setCollectingId] = useState(null)

  const open = data.donations.filter(
    (d) => d.status === 'OPEN' && volunteer.zones.includes(d.zone),
  )
  const myClaims = data.donations.flatMap((d) =>
    d.claims.filter((c) => c.volunteer_id === volunteer.id).map((c) => ({ ...c, donation: d })),
  )

  const collect = async (claim) => {
    if (collectingId) return
    setCollectingId(claim.id)
    try {
      setClaimError(await act((api) => api.collect(claim.id, volunteer.id), `Claim ${claim.id} collected`))
    } finally {
      setCollectingId(null)
    }
  }

  return (
    <>
      <section className="card">
        <h2>Open donations in my zones — {volunteer.name}</h2>
        <p className="hint">
          Capacity {volunteer.capacity_kg} kg · zones {volunteer.zones.join(', ')}
        </p>
        {open.length === 0 && (
          <div className="empty">
            <strong>Nothing to collect right now</strong>
            <span>No open donations in your zones. Check back after more food is posted.</span>
          </div>
        )}
        {open.map((d) => (
          <div className="item" key={d.id}>
            <div className="item-head">
              <strong>{d.description}</strong>
              <StatusBadge status={d.status} />
            </div>
            <p className="meta">
              {d.id} · Donor: {d.donor_name} · {d.zone} · {d.quantity_kg} kg
            </p>
            <p className="meta">Pickup window: {fmt(d.pickup_from)} → {fmt(d.pickup_until)}</p>
            <ProgressBar total={d.quantity_kg} remaining={d.remaining_kg} />
            <ClaimForm donation={d} volunteer={volunteer} clock={data.clock} act={act} />
          </div>
        ))}
      </section>

      <section className="card">
        <h2>My claims</h2>
        <ErrorBox error={claimError} />
        {myClaims.length === 0 && (
          <div className="empty">
            <strong>No claims yet</strong>
            <span>Claim some food from the open donations above.</span>
          </div>
        )}
        {myClaims.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Claim</th><th>Donation</th><th>kg</th><th>Planned</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {myClaims.map((c) => (
                  <tr key={c.id}>
                    <td>{c.id}</td>
                    <td>{c.donation.id} · {c.donation.description}</td>
                    <td>{c.kg}</td>
                    <td>{fmt(c.planned_time)}</td>
                    <td><StatusBadge status={c.status} /></td>
                    <td>
                      {c.status === 'ACTIVE' && (
                        <div className="actions">
                          <button disabled={collectingId !== null} onClick={() => collect(c)}>
                            {collectingId === c.id ? 'Collecting…' : 'Collect'}
                          </button>
                          <ConfirmButton
                            label="Cancel"
                            question={`Cancel claim ${c.id}?`}
                            disabled={collectingId !== null}
                            onConfirm={async () =>
                              setClaimError(await act((api) => api.cancelClaim(c.id, volunteer.id), `Claim ${c.id} cancelled`))
                            }
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
