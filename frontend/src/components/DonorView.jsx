import { useState } from 'react'
import ConfirmButton from './ConfirmButton'
import ErrorBox from './ErrorBox'
import ProgressBar from './ProgressBar'
import StatusBadge from './StatusBadge'

const fmt = (t) => t.replace('T', ' ')

export default function DonorView({ data, donor, act }) {
  const [form, setForm] = useState({
    description: '', quantity_kg: '', pickup_from: data.clock, pickup_until: '',
  })
  const [formError, setFormError] = useState(null)
  const [listError, setListError] = useState(null)
  const [posting, setPosting] = useState(false)

  const mine = data.donations.filter((d) => d.donor_id === donor.id)
  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  const post = async (e) => {
    e.preventDefault()
    if (posting) return
    setPosting(true)
    try {
      const error = await act(
        (api) =>
          api.postDonation({
            donor_id: donor.id,
            description: form.description,
            // Number('') is 0 and Number('2.5') is 2.5, so the backend can reject bad values
            quantity_kg: form.quantity_kg === '' ? null : Number(form.quantity_kg),
            pickup_from: form.pickup_from,
            pickup_until: form.pickup_until,
          }),
        'Donation posted',
      )
      setFormError(error)
      if (!error) setForm({ ...form, description: '', quantity_kg: '' })
    } finally {
      setPosting(false)
    }
  }

  return (
    <>
      <section className="card">
        <h2>Post surplus food — {donor.name} ({donor.zone})</h2>
        <form onSubmit={post} className="form">
          <label>Description
            <input value={form.description} onChange={set('description')} placeholder="e.g. Veg biryani" disabled={posting} />
          </label>
          <label>Quantity (whole kg)
            <input type="number" min="1" step="1" value={form.quantity_kg} onChange={set('quantity_kg')} disabled={posting} />
          </label>
          <label>Pickup from
            <input type="datetime-local" value={form.pickup_from} onChange={set('pickup_from')} disabled={posting} />
          </label>
          <label>Pickup until
            <input type="datetime-local" value={form.pickup_until} onChange={set('pickup_until')} disabled={posting} />
          </label>
          <button type="submit" disabled={posting}>{posting ? 'Posting…' : 'Post donation'}</button>
        </form>
        <ErrorBox error={formError} />
      </section>

      <section className="card">
        <h2>My donations</h2>
        <ErrorBox error={listError} />
        {mine.length === 0 && (
          <div className="empty">
            <strong>No donations yet</strong>
            <span>Post your first surplus food above and volunteers will be able to claim it.</span>
          </div>
        )}
        {mine.map((d) => (
          <div className="item" key={d.id}>
            <div className="item-head">
              <strong>{d.description}</strong>
              <StatusBadge status={d.status} />
            </div>
            <p className="meta">
              {d.id} · {d.donor_name || donor.name} · {d.zone} · {d.quantity_kg} kg
            </p>
            <p className="meta">Pickup window: {fmt(d.pickup_from)} → {fmt(d.pickup_until)}</p>
            <ProgressBar total={d.quantity_kg} remaining={d.remaining_kg} />
            {d.claims.length > 0 && (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Claim</th><th>Volunteer</th><th>kg</th><th>Planned</th><th>Status</th></tr></thead>
                  <tbody>
                    {d.claims.map((c) => (
                      <tr key={c.id}>
                        <td>{c.id}</td><td>{c.volunteer_name}</td><td>{c.kg}</td>
                        <td>{fmt(c.planned_time)}</td>
                        <td><StatusBadge status={c.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {d.status === 'OPEN' && (
              <div className="item-actions">
                <ConfirmButton
                  label="Cancel donation"
                  question={`Cancel "${d.description}"?`}
                  onConfirm={async () =>
                    setListError(await act((api) => api.cancelDonation(d.id, donor.id), `Donation ${d.id} cancelled`))
                  }
                />
              </div>
            )}
          </div>
        ))}
      </section>
    </>
  )
}
