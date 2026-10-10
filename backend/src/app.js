import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import {
  ApiError, buildView, claimViolations, claimsOf, donationStatus, findClaim, findDonation,
  findDonor, findVolunteer, isWholeKg, markMissedClaims, nextClaimId, nextDonationId,
  remainingKg, toMinutes,
} from './logic.js';

// Note on "two people claim the last kg at the same moment":
// Node runs one request handler at a time, and every handler below checks the rules and
// changes the state in one go (no awaiting in between). So the second request always sees
// the first one's claim and is refused by rule 3. That is why over-booking cannot happen.

export function createApp(store, { frontendDist } = {}) {
  const { state } = store;
  const app = express();
  app.use(express.json());

  const invalid = (errors) => new ApiError(400, 'INVALID_INPUT', 'The request is invalid.', { errors });
  const body = (req) => (req.body && typeof req.body === 'object' ? req.body : {});

  // ---- Read everything (UI calls this after every action) ----
  app.get('/api/state', (req, res) => res.json(buildView(state)));

  // ---- Clock: can only move forward ----
  app.post('/api/clock', (req, res) => {
    const { time } = body(req);
    const t = toMinutes(time);
    if (t === null) throw invalid(['time must look like YYYY-MM-DDTHH:MM and be a real date.']);
    if (t < toMinutes(state.clock)) {
      throw new ApiError(422, 'CLOCK_BACKWARDS', `The clock cannot move backwards (now ${state.clock}).`);
    }
    state.clock = time;
    markMissedClaims(state);
    store.save();
    res.json(buildView(state));
  });

  // ---- Donor posts a donation ----
  app.post('/api/donations', (req, res) => {
    const { donor_id, description, quantity_kg, pickup_from, pickup_until } = body(req);
    const errors = [];
    if (!findDonor(state, donor_id)) errors.push('donor_id must be an existing donor.');
    if (typeof description !== 'string' || description.trim() === '') errors.push('description is required.');
    if (!isWholeKg(quantity_kg)) errors.push('quantity_kg must be a whole number, at least 1.');
    const from = toMinutes(pickup_from);
    const until = toMinutes(pickup_until);
    if (from === null) errors.push('pickup_from must look like YYYY-MM-DDTHH:MM.');
    if (until === null) errors.push('pickup_until must look like YYYY-MM-DDTHH:MM.');
    if (errors.length) throw invalid(errors);

    const violations = [];
    if (!(from < until)) violations.push({ message: 'pickup_from must be before pickup_until.' });
    if (until < toMinutes(state.clock)) violations.push({ message: `pickup_until is before now (${state.clock}).` });
    if (violations.length) {
      throw new ApiError(422, 'RULES_VIOLATED', 'The donation was refused.', { violations });
    }

    const donation = {
      id: nextDonationId(state), donor_id, description: description.trim(), quantity_kg,
      pickup_from, pickup_until, cancelled: false,
    };
    state.donations.push(donation);
    store.save();
    res.status(201).json({ id: donation.id });
  });

  // ---- Donor cancels a donation ----
  app.post('/api/donations/:id/cancel', (req, res) => {
    const donation = findDonation(state, req.params.id);
    if (!donation) throw new ApiError(404, 'NOT_FOUND', 'Donation not found.');
    const { donor_id } = body(req);
    if (!findDonor(state, donor_id)) throw invalid(['donor_id must be an existing donor.']);
    if (donation.donor_id !== donor_id) {
      throw new ApiError(403, 'NOT_YOURS', 'Only the donor who posted it can cancel this donation.');
    }

    const violations = [];
    const status = donationStatus(state, donation);
    if (status !== 'OPEN') violations.push({ message: `Only OPEN donations can be cancelled (this one is ${status}).` });
    if (claimsOf(state, donation.id).some((c) => c.status === 'ACTIVE' || c.status === 'COLLECTED')) {
      violations.push({ message: 'It has ACTIVE or COLLECTED claims.' });
    }
    if (violations.length) {
      throw new ApiError(422, 'RULES_VIOLATED', 'The donation cannot be cancelled.', { violations });
    }

    donation.cancelled = true;
    store.save();
    res.json({ id: donation.id, status: 'CANCELLED' });
  });

  // ---- Volunteer claims food ----
  app.post('/api/donations/:id/claims', (req, res) => {
    const donation = findDonation(state, req.params.id);
    if (!donation) throw new ApiError(404, 'NOT_FOUND', 'Donation not found.');
    const { volunteer_id, kg, planned_time } = body(req);
    const errors = [];
    const volunteer = findVolunteer(state, volunteer_id);
    if (!volunteer) errors.push('volunteer_id must be an existing volunteer.');
    if (!isWholeKg(kg)) errors.push('kg must be a whole number, at least 1.');
    if (toMinutes(planned_time) === null) errors.push('planned_time must look like YYYY-MM-DDTHH:MM.');
    if (errors.length) throw invalid(errors);

    const violations = claimViolations(state, volunteer, donation, kg, planned_time);
    if (violations.length) {
      throw new ApiError(422, 'RULES_VIOLATED', 'The claim was refused.', { violations });
    }

    const claim = {
      id: nextClaimId(state), donation_id: donation.id, volunteer_id, kg,
      planned_time, status: 'ACTIVE',
    };
    state.claims.push(claim);
    store.save();
    res.status(201).json(claim);
  });

  // ---- Volunteer marks a claim as collected ----
  app.post('/api/claims/:id/collect', (req, res) => {
    const claim = ownClaim(req);
    const donation = findDonation(state, claim.donation_id);
    const now = toMinutes(state.clock);
    if (claim.status !== 'ACTIVE') {
      throw new ApiError(422, 'RULES_VIOLATED', 'The claim cannot be collected.', {
        violations: [{ message: `Only ACTIVE claims can be collected (this one is ${claim.status}).` }],
      });
    }
    if (now < toMinutes(donation.pickup_from) || now > toMinutes(donation.pickup_until)) {
      throw new ApiError(422, 'RULES_VIOLATED', 'The claim cannot be collected.', {
        violations: [{ message: `Collecting is only allowed between ${donation.pickup_from} and ${donation.pickup_until} (now ${state.clock}).` }],
      });
    }
    claim.status = 'COLLECTED';
    store.save();
    res.json(claim);
  });

  // ---- Volunteer cancels a claim ----
  app.post('/api/claims/:id/cancel', (req, res) => {
    const claim = ownClaim(req);
    const violations = [];
    if (claim.status !== 'ACTIVE') {
      violations.push({ message: `Only ACTIVE claims can be cancelled (this one is ${claim.status}).` });
    }
    if (!(toMinutes(state.clock) < toMinutes(claim.planned_time))) {
      violations.push({ message: `Cancelling is only allowed strictly before the planned time ${claim.planned_time} (now ${state.clock}).` });
    }
    if (violations.length) {
      throw new ApiError(422, 'RULES_VIOLATED', 'The claim cannot be cancelled.', { violations });
    }
    claim.status = 'CANCELLED'; // its kg automatically count as remaining again
    store.save();
    res.json(claim);
  });

  function ownClaim(req) {
    const claim = findClaim(state, req.params.id);
    if (!claim) throw new ApiError(404, 'NOT_FOUND', 'Claim not found.');
    const { volunteer_id } = body(req);
    if (!findVolunteer(state, volunteer_id)) throw invalid(['volunteer_id must be an existing volunteer.']);
    if (claim.volunteer_id !== volunteer_id) {
      throw new ApiError(403, 'NOT_YOURS', 'This claim belongs to another volunteer.');
    }
    return claim;
  }

  // ---- Optional: serve the built frontend (used when deploying as one app) ----
  if (frontendDist && fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(frontendDist, 'index.html')));
  }

  // ---- Errors: always answer with JSON ----
  app.use('/api', (req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown API route.' } }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof ApiError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message, ...err.details } });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Body is not valid JSON.' } });
    }
    console.error(err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong.' } });
  });

  return app;
}
