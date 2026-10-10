// Run with: npm test   (inside the backend folder)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.js';
import { createStore } from '../src/store.js';

const seedFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'seed.json');

// Starts a real server on a free port with its own temporary state file.
async function start(stateFile) {
  const file = stateFile || path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'surplus-')), 'state.json');
  const store = createStore(file, seedFile);
  const server = createApp(store).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://localhost:${server.address().port}`;
  const call = async (method, url, data) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    return { status: res.status, body: await res.json() };
  };
  return { call, file, store, close: () => server.close() };
}

const claim = (api, donation, volunteer, kg, time) =>
  api.call('POST', `/api/donations/${donation}/claims`, { volunteer_id: volunteer, kg, planned_time: time });
const setClock = (api, time) => api.call('POST', '/api/clock', { time });
const rules = (res) => res.body.error.violations.map((v) => v.rule);

// Seed reminder (clock 2026-03-10T12:00):
// DN1 D1 NORTH 30kg 18-20 | DN2 D2 NORTH 10kg 18-21 | DN3 D3 SOUTH 25kg 14-16
// DN4 D4 EAST 12kg 17-19  | DN5 D5 WEST 40kg 19-22
// V1 cap20 [N,E] | V2 cap15 [N] | V3 cap25 [S] | V4 cap30 [S,W] | V5 cap10 [E] | V6 cap18 [W,N]

test('loads the seed on first start', async () => {
  const api = await start();
  const { body } = await api.call('GET', '/api/state');
  assert.equal(body.clock, '2026-03-10T12:00');
  assert.equal(body.donations.length, 5);
  assert.ok(body.donations.every((d) => d.status === 'OPEN'));
  assert.equal(body.dashboard.listed, 117);
  assert.equal(body.dashboard.reconciles, true);
  api.close();
});

test('claim reports EVERY violated rule, not only the first', async () => {
  const api = await start();
  // V2 (cap 15, NORTH) claims 20 kg of DN3 (SOUTH, 14:00-16:00) at 11:00
  const res = await claim(api, 'DN3', 'V2', 20, '2026-03-10T11:00');
  assert.equal(res.status, 422);
  assert.deepEqual(rules(res), [2, 4, 5, 6]);
  api.close();
});

test('claim: rule 1 and rule 3 are reported', async () => {
  const api = await start();
  await api.call('POST', '/api/donations/DN1/cancel', { donor_id: 'D1' });
  const res = await claim(api, 'DN1', 'V1', 20, '2026-03-10T18:00');
  assert.deepEqual(rules(res), [1]);
  const r3 = await claim(api, 'DN2', 'V6', 18, '2026-03-10T18:00'); // only 10 kg left
  assert.deepEqual(rules(r3), [3]);
  api.close();
});

test('invalid input is rejected separately (400, no rule list)', async () => {
  const api = await start();
  for (const kg of [2.5, 0, -1, '5', null]) {
    const res = await claim(api, 'DN2', 'V2', kg, '2026-03-10T18:00');
    assert.equal(res.status, 400, `kg=${kg}`);
    assert.equal(res.body.error.code, 'INVALID_INPUT');
  }
  assert.equal((await claim(api, 'DN2', 'V2', 5, '10 March')).status, 400);
  assert.equal((await claim(api, 'DN2', 'V2', 5, '2026-02-31T10:00')).status, 400);
  assert.equal((await claim(api, 'DN2', 'NOPE', 5, '2026-03-10T18:00')).status, 400);
  assert.equal((await claim(api, 'DN99', 'V2', 5, '2026-03-10T18:00')).status, 404);
  api.close();
});

test('successful claim reduces remaining kg and uses window edges (inclusive)', async () => {
  const api = await start();
  assert.equal((await claim(api, 'DN2', 'V2', 4, '2026-03-10T18:00')).status, 201); // = pickup_from
  assert.equal((await claim(api, 'DN2', 'V6', 6, '2026-03-10T21:00')).status, 201); // = pickup_until
  const { body } = await api.call('GET', '/api/state');
  const dn2 = body.donations.find((d) => d.id === 'DN2');
  assert.equal(dn2.remaining_kg, 0);
  assert.equal(dn2.status, 'FULLY_CLAIMED');
  api.close();
});

test('rule 7: pickups of one volunteer must be at least 60 minutes apart', async () => {
  const api = await start();
  assert.equal((await claim(api, 'DN1', 'V1', 5, '2026-03-10T18:00')).status, 201);
  assert.deepEqual(rules(await claim(api, 'DN2', 'V1', 5, '2026-03-10T18:59')), [7]);
  assert.equal((await claim(api, 'DN2', 'V1', 5, '2026-03-10T19:00')).status, 201); // exactly 60 is fine
  assert.equal((await claim(api, 'DN4', 'V1', 5, '2026-03-10T17:00')).status, 201); // exactly 60 before
  api.close();
});

test('two volunteers claiming the last kg at the same time: only one wins', async () => {
  const api = await start();
  const results = await Promise.all([
    claim(api, 'DN2', 'V2', 10, '2026-03-10T18:30'),
    claim(api, 'DN2', 'V6', 10, '2026-03-10T18:30'),
  ]);
  const statuses = results.map((r) => r.status).sort();
  assert.deepEqual(statuses, [201, 422]);
  const loser = results.find((r) => r.status === 422);
  assert.deepEqual(rules(loser), [3]);
  const { body } = await api.call('GET', '/api/state');
  assert.equal(body.donations.find((d) => d.id === 'DN2').remaining_kg, 0);
  api.close();
});

test('clock never moves backwards; same time is allowed', async () => {
  const api = await start();
  const back = await setClock(api, '2026-03-10T11:59');
  assert.equal(back.status, 422);
  assert.equal(back.body.error.code, 'CLOCK_BACKWARDS');
  assert.equal((await setClock(api, '2026-03-10T12:00')).status, 200);
  assert.equal((await setClock(api, 'banana')).status, 400);
  assert.equal((await setClock(api, '2026-03-10T13:00')).status, 200);
  api.close();
});

test('moving the clock past pickup_until makes ACTIVE claims MISSED and food wasted', async () => {
  const api = await start();
  await claim(api, 'DN3', 'V3', 10, '2026-03-10T15:00');
  const { body } = await setClock(api, '2026-03-10T16:01');
  const dn3 = body.donations.find((d) => d.id === 'DN3');
  assert.equal(dn3.status, 'EXPIRED');
  assert.equal(dn3.claims[0].status, 'MISSED');
  const d = body.dashboard;
  assert.equal(d.missed, 10);
  assert.equal(d.wasted, 15);
  assert.equal(d.still_open, 92);
  assert.equal(d.reconciles, true);
  assert.deepEqual(body.dashboard.per_volunteer.find((v) => v.volunteer_id === 'V3'),
    { volunteer_id: 'V3', name: 'Meera', collected_kg: 0, missed_claims: 1 });
  // No new claims on an expired donation
  assert.ok(rules(await claim(api, 'DN3', 'V3', 1, '2026-03-10T16:30')).includes(1));
  api.close();
});

test('collect: only inside the pickup window, only by the owner', async () => {
  const api = await start();
  const c = (await claim(api, 'DN3', 'V3', 10, '2026-03-10T15:00')).body;
  const early = await api.call('POST', `/api/claims/${c.id}/collect`, { volunteer_id: 'V3' });
  assert.equal(early.status, 422); // now = 12:00, window starts 14:00
  await setClock(api, '2026-03-10T14:00');
  assert.equal((await api.call('POST', `/api/claims/${c.id}/collect`, { volunteer_id: 'V4' })).status, 403);
  assert.equal((await api.call('POST', `/api/claims/${c.id}/collect`, { volunteer_id: 'V3' })).status, 200);
  const again = await api.call('POST', `/api/claims/${c.id}/collect`, { volunteer_id: 'V3' });
  assert.equal(again.status, 422); // already COLLECTED
  const { body } = await api.call('GET', '/api/state');
  assert.equal(body.dashboard.collected, 10);
  assert.equal(body.dashboard.in_progress, 0);
  assert.equal(body.dashboard.per_donor.find((x) => x.donor_id === 'D3').collected_kg, 10);
  assert.equal(body.dashboard.reconciles, true);
  api.close();
});

test('cancel claim: only strictly before planned time; kg go back to the donation', async () => {
  const api = await start();
  const a = (await claim(api, 'DN4', 'V5', 5, '2026-03-10T17:30')).body;
  let state = (await api.call('GET', '/api/state')).body;
  assert.equal(state.donations.find((d) => d.id === 'DN4').remaining_kg, 7);
  assert.equal((await api.call('POST', `/api/claims/${a.id}/cancel`, { volunteer_id: 'V5' })).status, 200);
  state = (await api.call('GET', '/api/state')).body;
  assert.equal(state.donations.find((d) => d.id === 'DN4').remaining_kg, 12);

  const b = (await claim(api, 'DN4', 'V5', 5, '2026-03-10T17:30')).body;
  await setClock(api, '2026-03-10T17:30'); // now == T, not strictly before
  const late = await api.call('POST', `/api/claims/${b.id}/cancel`, { volunteer_id: 'V5' });
  assert.equal(late.status, 422);
  api.close();
});

test('donor cancel: only OPEN, no ACTIVE/COLLECTED claims, only the owner', async () => {
  const api = await start();
  assert.equal((await api.call('POST', '/api/donations/DN1/cancel', { donor_id: 'D2' })).status, 403);
  await claim(api, 'DN2', 'V2', 3, '2026-03-10T18:00');
  const blocked = await api.call('POST', '/api/donations/DN2/cancel', { donor_id: 'D2' });
  assert.equal(blocked.status, 422);
  assert.equal((await api.call('POST', '/api/donations/DN1/cancel', { donor_id: 'D1' })).status, 200);
  const { body } = await api.call('GET', '/api/state');
  assert.equal(body.donations.find((d) => d.id === 'DN1').status, 'CANCELLED');
  assert.equal(body.dashboard.listed, 87); // 117 - 30, cancelled donations are excluded
  assert.equal(body.dashboard.reconciles, true);
  // cancelled again -> refused
  assert.equal((await api.call('POST', '/api/donations/DN1/cancel', { donor_id: 'D1' })).status, 422);
  api.close();
});

test('posting a donation: validation and rules', async () => {
  const api = await start();
  const ok = { donor_id: 'D1', description: 'Soup', quantity_kg: 7, pickup_from: '2026-03-10T13:00', pickup_until: '2026-03-10T15:00' };
  assert.equal((await api.call('POST', '/api/donations', { ...ok, quantity_kg: 2.5 })).status, 400);
  assert.equal((await api.call('POST', '/api/donations', { ...ok, quantity_kg: 0 })).status, 400);
  assert.equal((await api.call('POST', '/api/donations', { ...ok, description: '  ' })).status, 400);
  assert.equal((await api.call('POST', '/api/donations', { ...ok, donor_id: 'X' })).status, 400);
  const equal = await api.call('POST', '/api/donations', { ...ok, pickup_until: ok.pickup_from });
  assert.equal(equal.status, 422);
  const both = await api.call('POST', '/api/donations', { ...ok, pickup_from: '2026-03-10T12:00', pickup_until: '2026-03-10T11:00' });
  assert.equal(both.body.error.violations.length, 2); // not before, and in the past
  const created = await api.call('POST', '/api/donations', ok);
  assert.equal(created.status, 201);
  assert.equal(created.body.id, 'DN6');
  const { body } = await api.call('GET', '/api/state');
  assert.equal(body.dashboard.listed, 124);
  assert.equal(body.donations.find((d) => d.id === 'DN6').zone, 'NORTH');
  api.close();
});

test('state survives a restart (and the seed is NOT loaded again)', async () => {
  const first = await start();
  await first.call('POST', '/api/donations', { donor_id: 'D4', description: 'Rice', quantity_kg: 3, pickup_from: '2026-03-10T13:00', pickup_until: '2026-03-10T14:00' });
  await claim(first, 'DN2', 'V2', 4, '2026-03-10T18:00');
  await setClock(first, '2026-03-10T13:30');
  first.close();

  const second = await start(first.file); // new store reading the same file
  const { body } = await second.call('GET', '/api/state');
  assert.equal(body.clock, '2026-03-10T13:30');
  assert.equal(body.donations.length, 6);
  assert.equal(body.donations.find((d) => d.id === 'DN2').remaining_kg, 6);
  second.close();
});

test('dashboard always reconciles through a mixed scenario', async () => {
  const api = await start();
  await claim(api, 'DN1', 'V1', 20, '2026-03-10T18:00');
  await claim(api, 'DN1', 'V2', 10, '2026-03-10T19:00');
  await claim(api, 'DN5', 'V6', 18, '2026-03-10T20:00');
  await claim(api, 'DN4', 'V5', 10, '2026-03-10T17:00');
  for (const t of ['2026-03-10T17:00', '2026-03-10T18:30', '2026-03-10T19:30', '2026-03-10T20:30', '2026-03-10T21:30', '2026-03-10T23:00']) {
    await setClock(api, t);
    if (t === '2026-03-10T17:00') await api.call('POST', '/api/claims/C4/collect', { volunteer_id: 'V5' });
    const { body } = await api.call('GET', '/api/state');
    assert.equal(body.dashboard.reconciles, true, `at ${t}`);
  }
  api.close();
});
