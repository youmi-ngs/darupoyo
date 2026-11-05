import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cwd = fileURLToPath(new URL('../', import.meta.url));
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.pid) {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill(); }
  }
  process.exitCode = code;
}
for (const script of ['dev', 'dev:backend']) {
  const child = spawn('npm', ['run', script], { cwd, stdio:'inherit', detached:true });
  children.push(child);
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => { if (!stopping) stop(code || 0); });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
