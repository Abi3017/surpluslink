// All SurplusLink business rules live here as plain functions.
// They only read/modify the "state" object, so they are easy to test.

const TIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

// "2026-03-10T18:00" -> minutes since 1970 (or null if not a real date/time).
// We use UTC maths only to avoid any time-zone surprises. The real clock is never used.
export function toMinutes(text) {
  if (typeof text !== 'string') return null;
  const m = TIME_RE.exec(text);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const ms = Date.UTC(y, mo - 1, d, h, mi);
  const back = new Date(ms);
  // Reject impossible values such as 2026-02-31 or 25:00
  if (
    back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 ||
    back.getUTCDate() !== d || back.getUTCHours() !== h || back.getUTCMinutes() !== mi
  ) return null;
  return ms / 60000;
}

export class ApiError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const isWholeKg = (n) => typeof n === 'number' && Number.isInteger(n) && n >= 1;

// ---------- Lookups ----------
export const findDonor = (s, id) => s.donors.find((d) => d.id === id);
export const findVolunteer = (s, id) => s.volunteers.find((v) => v.id === id);
export const findDonation = (s, id) => s.donations.find((d) => d.id === id);
export const findClaim = (s, id) => s.claims.find((c) => c.id === id);

export const zoneOf = (s, donation) => findDonor(s, donation.donor_id).zone;

export const claimsOf = (s, donationId) => s.claims.filter((c) => c.donation_id === donationId);

// ---------- Derived values ----------

// Remaining kg = quantity minus all claims that are not CANCELLED
// (ACTIVE, COLLECTED and MISSED claims all still use up food).
export function remainingKg(s, donation) {
  const used = claimsOf(s, donation.id)
    .filter((c) => c.status !== 'CANCELLED')
    .reduce((sum, c) => sum + c.kg, 0);
  return donation.quantity_kg - used;
}

// Status is the first that applies: CANCELLED, EXPIRED, FULLY_CLAIMED, OPEN.
export function donationStatus(s, donation) {
  if (donation.cancelled) return 'CANCELLED';
  if (toMinutes(s.clock) > toMinutes(donation.pickup_until)) return 'EXPIRED';
  if (remainingKg(s, donation) === 0) return 'FULLY_CLAIMED';
  return 'OPEN';
}

// When the clock passes a donation's pickup_until, its ACTIVE claims become MISSED.
export function markMissedClaims(s) {
  let changed = false;
  for (const claim of s.claims) {
    if (claim.status !== 'ACTIVE') continue;
    const donation = findDonation(s, claim.donation_id);
    if (toMinutes(s.clock) > toMinutes(donation.pickup_until)) {
      claim.status = 'MISSED';
      changed = true;
    }
  }
  return changed;
}

// ---------- Claim rules ----------

// Returns a list of EVERY rule that is broken (empty list = claim is allowed).
export function claimViolations(s, volunteer, donation, kg, plannedTime) {
  const violations = [];
  const add = (rule, message) => violations.push({ rule, message });

  const status = donationStatus(s, donation);
  const now = toMinutes(s.clock);
  const t = toMinutes(plannedTime);

  if (status === 'CANCELLED' || status === 'EXPIRED') {
    add(1, `The donation is ${status}.`);
  }
  if (kg > volunteer.capacity_kg) {
    add(2, `${kg} kg is more than your capacity of ${volunteer.capacity_kg} kg.`);
  }
  const remaining = remainingKg(s, donation);
  if (kg > remaining) {
    add(3, `${kg} kg is more than the ${remaining} kg still remaining on this donation.`);
  }
  const zone = zoneOf(s, donation);
  if (!volunteer.zones.includes(zone)) {
    add(4, `The donation is in zone ${zone}, but you only cover ${volunteer.zones.join(', ')}.`);
  }
  if (t < toMinutes(donation.pickup_from) || t > toMinutes(donation.pickup_until)) {
    add(5, `Pickup time must be between ${donation.pickup_from} and ${donation.pickup_until}.`);
  }
  if (t < now) {
    add(6, `Pickup time is before the current clock (${s.clock}).`);
  }
  for (const other of s.claims) {
    if (other.volunteer_id !== volunteer.id) continue;
    if (other.status !== 'ACTIVE' && other.status !== 'COLLECTED') continue;
    if (Math.abs(t - toMinutes(other.planned_time)) < 60) {
      add(7, `Too close to your ${other.status} claim ${other.id} planned at ${other.planned_time} (need at least 60 minutes between pickups).`);
      break; // one message is enough; rule 7 is already reported
    }
  }
  return violations;
}

// ---------- Dashboard ----------

export function buildDashboard(s) {
  const live = s.donations.filter((d) => !d.cancelled);
  const liveIds = new Set(live.map((d) => d.id));
  const liveClaims = s.claims.filter((c) => liveIds.has(c.donation_id));
  const kgWith = (status) =>
    liveClaims.filter((c) => c.status === status).reduce((sum, c) => sum + c.kg, 0);

  const listed = live.reduce((sum, d) => sum + d.quantity_kg, 0);
  const collected = kgWith('COLLECTED');
  const missed = kgWith('MISSED');
  const inProgress = kgWith('ACTIVE');
  let wasted = 0;
  let stillOpen = 0;
  for (const d of live) {
    if (donationStatus(s, d) === 'EXPIRED') wasted += remainingKg(s, d);
    else stillOpen += remainingKg(s, d);
  }
  const sumOfOthers = collected + missed + wasted + inProgress + stillOpen;

  const donationOwner = new Map(live.map((d) => [d.id, d.donor_id]));
  return {
    listed, collected, missed, wasted, in_progress: inProgress, still_open: stillOpen,
    sum_of_others: sumOfOthers,
    reconciles: listed === sumOfOthers,
    per_donor: s.donors.map((donor) => ({
      donor_id: donor.id,
      name: donor.name,
      collected_kg: liveClaims
        .filter((c) => c.status === 'COLLECTED' && donationOwner.get(c.donation_id) === donor.id)
        .reduce((sum, c) => sum + c.kg, 0),
    })),
    per_volunteer: s.volunteers.map((v) => ({
      volunteer_id: v.id,
      name: v.name,
      collected_kg: liveClaims
        .filter((c) => c.volunteer_id === v.id && c.status === 'COLLECTED')
        .reduce((sum, c) => sum + c.kg, 0),
      missed_claims: liveClaims.filter((c) => c.volunteer_id === v.id && c.status === 'MISSED').length,
    })),
  };
}

// ---------- What the API sends to the UI ----------

export function buildView(s) {
  return {
    clock: s.clock,
    donors: s.donors,
    volunteers: s.volunteers,
    donations: s.donations.map((d) => ({
      id: d.id,
      donor_id: d.donor_id,
      donor_name: findDonor(s, d.donor_id).name,
      zone: zoneOf(s, d),
      description: d.description,
      quantity_kg: d.quantity_kg,
      pickup_from: d.pickup_from,
      pickup_until: d.pickup_until,
      status: donationStatus(s, d),
      remaining_kg: remainingKg(s, d),
      claims: claimsOf(s, d.id).map((c) => ({
        ...c,
        volunteer_name: findVolunteer(s, c.volunteer_id).name,
      })),
    })),
    dashboard: buildDashboard(s),
  };
}

function nextId(prefix, items) {
  const max = items.reduce((m, i) => Math.max(m, Number(i.id.slice(prefix.length)) || 0), 0);
  return `${prefix}${max + 1}`;
}
export const nextDonationId = (s) => nextId('DN', s.donations);
export const nextClaimId = (s) => nextId('C', s.claims);
