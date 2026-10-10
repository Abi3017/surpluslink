import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { createStore } from './store.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stateFile = process.env.STATE_FILE || path.join(root, 'data', 'state.json');
const port = process.env.PORT || 3001;

const store = createStore(stateFile, path.join(root, 'seed.json'));
const app = createApp(store, { frontendDist: path.join(root, '..', 'frontend', 'dist') });

// In Express 5 the callback receives an error if the port cannot be used (for example, already taken).
app.listen(port, (error) => {
  if (error) {
    console.error(`Cannot start on port ${port}: ${error.message}`);
    process.exit(1);
  }
  console.log(`SurplusLink backend running at http://localhost:${port}`);
  console.log(`State file: ${stateFile}`);
});
