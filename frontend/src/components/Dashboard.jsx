const FIGURES = [
  ['listed', 'Listed', 'listed'],
  ['collected', 'Collected', 'collected'],
  ['missed', 'Missed', 'missed'],
  ['wasted', 'Wasted', 'wasted'],
  ['in_progress', 'In progress', 'progress'],
  ['still_open', 'Still open', 'open'],
]

export default function Dashboard({ dashboard }) {
  const d = dashboard
  return (
    <section className="card">
      <div className="card-title">
        <h2>Dashboard <span className="unit">(kg)</span></h2>
        <span className={`chip ${d.reconciles ? 'ok' : 'bad'}`}>
          {d.reconciles ? '✔ Reconciles' : '✘ Does NOT reconcile'}
        </span>
      </div>

      <div className="tiles">
        {FIGURES.map(([key, label, tone]) => (
          <div className={`tile tile-${tone}`} key={key}>
            <span className="tile-label">{label}</span>
            <span className="tile-value">{d[key]}</span>
          </div>
        ))}
      </div>
      <p className={`reconcile-line ${d.reconciles ? 'ok' : 'bad'}`}>
        Listed {d.listed} {d.reconciles ? '=' : '≠'} {d.collected} + {d.missed} + {d.wasted} + {d.in_progress} +{' '}
        {d.still_open} = {d.sum_of_others}
      </p>

      <div className="two-col">
        <div>
          <h3>Collected per donor</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Donor</th><th>Collected kg</th></tr></thead>
              <tbody>
                {d.per_donor.map((x) => (
                  <tr key={x.donor_id}><td>{x.name}</td><td>{x.collected_kg}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h3>Volunteers</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Volunteer</th><th>Collected kg</th><th>Missed claims</th></tr></thead>
              <tbody>
                {d.per_volunteer.map((x) => (
                  <tr key={x.volunteer_id}><td>{x.name}</td><td>{x.collected_kg}</td><td>{x.missed_claims}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}
