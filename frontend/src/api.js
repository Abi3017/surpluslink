// Small helper functions that talk to the backend.
// If the backend refuses a request, we throw its error object ({ message, violations, errors }).

async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw data.error || { message: `Request failed (${res.status})` }
  return data
}

export const api = {
  getState: () => request('GET', '/api/state'),
  setClock: (time) => request('POST', '/api/clock', { time }),
  postDonation: (donation) => request('POST', '/api/donations', donation),
  cancelDonation: (id, donor_id) => request('POST', `/api/donations/${id}/cancel`, { donor_id }),
  claim: (donationId, claim) => request('POST', `/api/donations/${donationId}/claims`, claim),
  collect: (claimId, volunteer_id) => request('POST', `/api/claims/${claimId}/collect`, { volunteer_id }),
  cancelClaim: (claimId, volunteer_id) => request('POST', `/api/claims/${claimId}/cancel`, { volunteer_id }),
}

// "2026-03-10T12:00" + 90 minutes -> "2026-03-10T13:30" (pure text maths, no real clock)
export function addMinutes(text, minutes) {
  const d = new Date(`${text}:00Z`)
  d.setUTCMinutes(d.getUTCMinutes() + minutes)
  return d.toISOString().slice(0, 16)
}
