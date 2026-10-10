// Saves the whole app state to one JSON file so it survives a backend restart.
import fs from 'node:fs';
import path from 'node:path';
import { markMissedClaims } from './logic.js';

export function createStore(stateFile, seedFile) {
  let state;

  if (fs.existsSync(stateFile)) {
    // Saved state exists: use it. The seed is NOT loaded.
    state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } else {
    // First run only: start from the seed.
    const seed = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
    state = {
      clock: seed.clock,
      donors: seed.donors,
      volunteers: seed.volunteers,
      donations: seed.donations.map((d) => ({ ...d, cancelled: false })),
      claims: [],
    };
  }

  function save() {
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    // Write to a temp file first, then rename, so a crash cannot leave a half-written file.
    const tmp = `${stateFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, stateFile);
  }

  markMissedClaims(state);
  save();

  return { state, save };
}
