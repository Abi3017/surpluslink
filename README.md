# SurplusLink

A web app that connects restaurants with spare cooked food to volunteers who can collect it before it is wasted.

- **Donors (restaurants)** post surplus food with a pickup window, and can cancel it.
- **Volunteers** see open donations in their zones, claim some kilograms, then collect or cancel the claim.
- The system enforces capacity, zone and timing rules, never over-books a donation, and shows how much food was saved or wasted on a dashboard.
- There is no login: you choose who you are acting as from a dropdown.

**Stack:** React + Vite (frontend), Node.js + Express (backend). State is saved in a JSON file. No database, no external services, no API keys.

## Features

- Acting-as selector (5 donors, 6 volunteers from `backend/seed.json`)
- Simulated clock that can only move forward (the real system time is never used)
- Donors: post donation, cancel donation, see their donations with all claims
- Volunteers: see OPEN donations in their zones, claim with **all** violated rules shown on refusal, collect, cancel
- Donation status: `CANCELLED` / `EXPIRED` / `FULLY_CLAIMED` / `OPEN`; claim status: `ACTIVE` / `COLLECTED` / `CANCELLED` / `MISSED`
- When the clock passes a donation's `pickup_until`, its ACTIVE claims become MISSED
- Dashboard: Listed, Collected, Missed, Wasted, In progress, Still open, a live "Listed = sum of the other five" check, collected kg per donor, collected kg and missed claims per volunteer
- State survives a backend restart (`backend/data/state.json`)

## Requirements

Node.js 20 or newer (tested with Node 24) and npm.

## How to run

You need **two terminals** (PowerShell), both starting in the project folder.

**Terminal 1 – backend** (http://localhost:3001)

```powershell
cd backend
npm install
npm start
```

**Terminal 2 – frontend** (http://localhost:5173)

```powershell
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

The first start loads `backend/seed.json`. After that the saved state in `backend/data/state.json` is used instead. To start again from the seed, stop the backend, delete `backend/data/state.json`, and start it again.

### Run as one app (optional, also used for deployment)

```powershell
cd frontend
npm install
npm run build
cd ../backend
npm install
npm start
```

Then open http://localhost:3001 — the backend also serves the built frontend.
Environment variables: `PORT` (default 3001) and `STATE_FILE` (default `backend/data/state.json`).

## Tests

```powershell
cd backend
npm test
```

Runs 15 automated API tests (Node's built-in test runner, no extra packages). They use a temporary state file, so your saved data is not touched. They cover every claim rule, "report all violations", invalid input, the 60-minute rule, the last-kg race, the clock, MISSED/EXPIRED, collect/cancel, donation cancel, dashboard reconciliation and persistence.

Frontend checks: `cd frontend; npm run lint; npm run build`.

## Project structure

```
backend/
  seed.json            data provided by the organisers
  src/logic.js         all business rules (pure functions)
  src/app.js           Express routes + input validation
  src/store.js         loads the seed once, saves state to a JSON file
  src/server.js        starts the server
  test/api.test.js     automated tests
frontend/src/
  App.jsx              page layout, "acting as" selector, data loading
  api.js               calls to the backend
  components/          ClockPanel, Dashboard, DonorView, VolunteerView, ErrorBox
```

## API

| Method | Path | Body | Purpose |
|---|---|---|---|
| GET | `/api/state` | – | Everything: clock, people, donations (with status, remaining kg, claims), dashboard |
| POST | `/api/clock` | `{time}` | Move the clock forward |
| POST | `/api/donations` | `{donor_id, description, quantity_kg, pickup_from, pickup_until}` | Post a donation |
| POST | `/api/donations/:id/cancel` | `{donor_id}` | Donor cancels |
| POST | `/api/donations/:id/claims` | `{volunteer_id, kg, planned_time}` | Claim food |
| POST | `/api/claims/:id/collect` | `{volunteer_id}` | Mark collected |
| POST | `/api/claims/:id/cancel` | `{volunteer_id}` | Cancel a claim |

Errors are JSON. **400** `INVALID_INPUT` means the input itself is bad (for example kg is 2.5, or a time is not `YYYY-MM-DDTHH:MM`). **422** `RULES_VIOLATED` means the input is fine but business rules are broken, and the response lists **every** broken rule (`violations: [{rule, message}]`). **403** means acting on someone else's item; **404** means not found.

## How over-booking is prevented

Node handles one request at a time, and each route checks the rules and saves the claim in a single step with nothing asynchronous in between. If two volunteers claim the last kg at the same moment, the second request already sees the first claim and is refused by rule 3. There is an automated test for this.

## Assumptions

1. **Identity without login:** the UI sends the chosen donor/volunteer id with each action, and the backend only lets you cancel your own donation or collect/cancel your own claim.
2. **Remaining kg** follows the statement exactly: quantity minus all claims that are not CANCELLED. So MISSED claims still count as used, which means food in a MISSED claim is reported as "Missed" and not again as "Wasted".
3. **Wasted** = remaining kg on EXPIRED donations; **Still open** = remaining kg on all non-EXPIRED donations (this includes FULLY_CLAIMED ones, which have 0 remaining).
4. **Expired** means the clock is strictly after `pickup_until`. At exactly `pickup_until` the donation is still valid and claims are not missed yet.
5. A donor can cancel only a donation whose status is OPEN, so a FULLY_CLAIMED donation cannot be cancelled even if all its claims were later cancelled — in that case the kg return and it becomes OPEN again.
6. Posting a donation with `pickup_from` in the past is allowed as long as `pickup_until` is not before now (that is the only "past" rule in the statement). If both rules are broken, both are reported.
7. When a claim breaks rule 7 against several of the volunteer's other claims, the rule is reported once (naming one conflicting claim).
8. Rules 1–7 are all evaluated even if some inputs make others meaningless, so a refusal can list several reasons at once. Rule 7 uses the difference in minutes (exactly 60 is allowed).
9. Volunteers only see OPEN donations in their zones, including ones whose pickup window has not started yet.
10. The clock is moved with a date-time picker or +30 min / +1 hour / +1 day buttons. Date maths is done on the text values only, never with the real system clock.
11. The saved state is a single JSON file written on every change (write to a temp file, then rename).
12. Cancelled donations are excluded from every dashboard figure.

## Not done / limitations

- No authentication (by design), no database.
- No multi-user live refresh: the page updates after your own actions; reload to see other people's changes.
- The UI was checked with lint, a production build and API-level tests, but the individual screens were not covered by automated browser tests.
