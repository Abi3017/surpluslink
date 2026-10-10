# AI Usage

## Tools used

- **Claude Code** (model: Claude Sonnet 5.5) inside the Antigravity IDE, on 2026-10-10 during the hackathon.
- No other AI tools are recorded here. *(Author: add any other tool you used.)*

## Summary

Claude Code wrote the first version of almost all the code and documents in this repository, working step by step with the author, who supplied the problem statement and seed file, set the technology choices (React + Vite, Node + Express) and the working rules (simple, no database, no extra dependencies, test everything).

## Where AI was used

| Area | What the AI did |
|---|---|
| Project inspection | Read the existing Vite project, checked `npm run lint`, `npm run build`, and that the dev server answers on port 5173 (before the hackathon). |
| Planning | Read the PDF and seed file, proposed the structure: pure rules module, JSON-file store, thin Express routes, one `/api/state` read endpoint. |
| Backend (`backend/src/*`) | Wrote all rules: remaining kg, status, claim rules 1–7 reporting all violations, collect/cancel, MISSED sweep on clock move, dashboard and reconciliation, JSON persistence. |
| Tests (`backend/test/api.test.js`) | Wrote 15 API tests using Node's built-in runner. |
| Frontend (`frontend/src/*`, `vite.config.js`, `index.html`) | Replaced the Vite demo page with the SurplusLink UI (acting-as selector, donor view, volunteer view, clock, dashboard) and added the `/api` dev proxy. |
| Documentation | Wrote `README.md`, this file and `.gitignore`. |

## What was accepted, changed or rejected

**Changed after something failed (found by running the tools, not by guessing):**
- `npm test` first failed because Node 24 treated the `test/` folder as a module; the script was changed to `node --test test/api.test.js`.
- `npm run lint` rejected setting React state inside `useEffect` via a helper; the effect was rewritten to call `api.getState().then(setData)` directly.
- A first attempt to run the end-to-end smoke test was blocked by the sandbox; it was re-run with different commands.

**Design options the AI considered and did not use (to meet "keep it simple"):** a database (SQLite etc.), the `cors` package (the Vite proxy makes it unnecessary), a `concurrently` script to start both servers, a state library for the frontend, TypeScript, and a "reset data" endpoint.

**Kept from the problem statement exactly:** all formulas (remaining kg, status order, dashboard figures) and rules; ambiguous points are listed under "Assumptions" in `README.md`.

## How the code was verified

- `cd backend; npm test` → 15 of 15 tests passed (run by the AI during development).
- `cd frontend; npm run lint` and `npm run build` → both passed.
- Smoke test with the real servers: request through the Vite proxy, a successful claim, a refusal listing 4 violated rules, backend restart with state preserved, built frontend served by Express.
- **Not done by the AI:** the screens were not clicked through in a real browser.

## Human review (to be completed by the author before submission)

*The AI cannot truthfully fill this in. Tick only what you actually did.*

- [ ] I read `backend/src/logic.js` and can explain claim rules 1–7 and the dashboard formulas.
- [ ] I read `backend/src/app.js` and can explain the 400 / 422 / 403 responses and why two claims cannot over-book.
- [ ] I read `backend/src/store.js` and can explain how persistence works.
- [ ] I clicked through the UI as a donor and as a volunteer (post, claim, refused claim, collect, cancel, clock, dashboard).
- [ ] I ran `npm test` myself.
- [ ] I checked the README assumptions and agree with them.

Changes I made myself, or AI output I rejected or modified: *(write here, or "none")*
