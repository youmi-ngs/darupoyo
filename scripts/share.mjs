// Lets teammates try the app on their phones: runs `npm run dev:all` on this PC and gives it a
// temporary https URL with a Cloudflare quick tunnel (free, no account). Ctrl+C stops everything.
// The login is the fake development login: anyone with the URL can join, so share it only
// within the team and stop it when you are done.
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
function run(command, args, options = {}) {
  const child = spawn(command, args, { cwd, detached: true, ...options, env: { ...process.env, ...options.env } });
  children.push(child);
  child.on('error', error => { console.error(command + ': ' + error.message); stop(1); });
  child.on('exit', code => { if (!stopping) stop(code || 0); });
  return child;
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

run('npm', ['run', 'dev:all'], { stdio: 'inherit', env: { SHARE_TUNNEL: '1' } });
for (let i = 0; i < 120 && !stopping; i++) {
  try { if ((await fetch('http://127.0.0.1:8080/healthz')).ok) break; } catch {}
  await new Promise(r => setTimeout(r, 500));
}
const tunnel = run('cloudflared', ['tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:5173'], { stdio: ['ignore', 'ignore', 'pipe'] });
let shown = false;
tunnel.stderr.on('data', chunk => {
  const url = String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
  if (url && !shown) {
    shown = true;
    console.log([
      '',
      '  ┌─ チームに配るURL（スマホでもカメラ・マイクが使えます）',
      '  │  ' + url,
      '  │  1人目がハウスを作り、メニューの「友だちを招待する」でリンクを送る',
      '  │  URLを知っている人は誰でも入れるので、チーム内だけで共有。終わったら Ctrl+C',
      '  └─ 記録は止めると消えます',
      '',
    ].join('\n'));
  }
});
