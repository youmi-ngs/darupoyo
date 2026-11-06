// Local run against Firebase Emulator Suite (Auth / Firestore / Storage). Never touches a real project.
// Starts the emulators, then the unchanged Backend pointed at them by env vars, then Vite.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const PROJECT = 'demo-darupoyo'; // demo-* IDs make the emulators refuse real-project access
const DATA = '.emulator-data';  // kept between runs; delete it to start fresh
const JAVA = '/opt/homebrew/opt/openjdk@21/bin';
const PATH = (existsSync(JAVA) ? JAVA + ':' : '') + process.env.PATH;

const emulatorEnv = {
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8085',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  STORAGE_EMULATOR_HOST: 'http://127.0.0.1:9199',
};
const backendEnv = {
  ...emulatorEnv,
  APP_ENV: 'local', DATA_BACKEND: 'firestore', AUTH_MODE: 'firebase', PRAISE_BACKEND: 'fallback',
  GOOGLE_CLOUD_PROJECT: PROJECT, STORAGE_BUCKET: PROJECT + '.appspot.com',
  // Placeholder web config: the emulators accept any key.
  FIREBASE_WEB_API_KEY: 'demo-key', FIREBASE_AUTH_DOMAIN: PROJECT + '.firebaseapp.com', FIREBASE_APP_ID: 'demo-app',
  CORS_ORIGINS: 'http://127.0.0.1:5173,http://localhost:5173',
};

const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.pid) {
    try { process.kill(-child.pid, 'SIGINT'); } catch { child.kill(); }
  }
  process.exitCode = code;
}
function run(command, args, options = {}) {
  const child = spawn(command, args, { cwd, stdio: 'inherit', detached: true, ...options, env: { ...process.env, PATH, ...options.env } });
  children.push(child);
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => { if (!stopping) stop(code || 0); });
  return child;
}
async function waitFor(url, seconds = 90) {
  for (let i = 0; i < seconds * 2 && !stopping; i++) {
    try { await fetch(url); return; } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('Timed out waiting for ' + url);
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

run('npx', ['firebase', 'emulators:start', '--project', PROJECT, '--only', 'auth,firestore,storage', '--import', DATA, '--export-on-exit', DATA]);
try {
  await Promise.all(['http://127.0.0.1:9099', 'http://127.0.0.1:8085', 'http://127.0.0.1:9199'].map(u => waitFor(u)));
  run('.venv/bin/python', ['-m', 'uvicorn', 'src.app.main:app', '--host', '127.0.0.1', '--port', '8080', '--reload', '--reload-dir', 'src'], { cwd: cwd + 'backend', env: backendEnv });
  run('npm', ['run', 'dev'], { env: { VITE_FIREBASE_EMULATORS: '1' } });
  await waitFor('http://127.0.0.1:8080/healthz');
  console.log('\n  App:       http://127.0.0.1:5173\n  Emulators: http://127.0.0.1:4000\n');
} catch (error) { console.error(error.message); stop(1); }
