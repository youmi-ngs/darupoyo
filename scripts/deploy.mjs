// Deploy both halves of this repository. No service-account key files are needed.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(readFileSync(new URL('../deploy/config.json', import.meta.url)));
const firebase = fileURLToPath(new URL('../node_modules/.bin/firebase', import.meta.url));
function run(command, args, { json = false, env = {} } = {}) {
  const result = spawnSync(command, args, { cwd: root, env: { ...process.env, ...env }, encoding: 'utf8', stdio: json ? ['ignore', 'pipe', 'inherit'] : 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
  return json ? JSON.parse(result.stdout) : undefined;
}
try {
  const project = config.projectId;
  const site = config.hostingSite || project;
  const target = run('gcloud', ['projects', 'describe', project, '--format=json'], { json: true });
  if (target.projectId !== project || target.lifecycleState !== 'ACTIVE') throw new Error('Target project is not active');
  const apps = run(firebase, ['apps:list', 'WEB', '--project', project, '--json'], { json: true }).result;
  const app = config.webAppId ? apps.find(app => app.appId === config.webAppId) : apps.length === 1 ? apps[0] : null;
  if (!app) throw new Error('Create a Firebase Web app, or set webAppId in deploy/config.json when multiple apps exist');
  const web = run(firebase, ['apps:sdkconfig', 'WEB', app.appId, '--project', project, '--json'], { json: true }).result.sdkConfig;
  const bucket = config.storageBucket || web.storageBucket;
  if (!bucket || !web.apiKey || !web.appId) throw new Error('Firebase Web config or Storage bucket is missing');
  const hosting = JSON.parse(readFileSync(new URL('../firebase.json', import.meta.url))).hosting;
  if ((hosting.site || project) !== site) throw new Error('Hosting site must match deploy/config.json');
  if (hosting.rewrites.some(rule => rule.run && (rule.run.serviceId !== config.service || rule.run.region !== config.region))) throw new Error('firebase.json rewrites must match deploy/config.json');
  run('npm', ['test']);
  run('npm', ['run', 'build'], { env: { VITE_API_BASE_URL: '/api' } });
  run(firebase, ['deploy', '--only', 'firestore:rules,firestore:indexes', '--project', project, '--non-interactive']);
  run('bash', ['backend/scripts/deploy.sh'], { env: {
    PROJECT_ID: project, REGION: config.region, SERVICE_NAME: config.service,
    ARTIFACT_REPOSITORY: config.repository,
    SERVICE_ACCOUNT: `${config.runtimeServiceAccount}@${project}.iam.gserviceaccount.com`,
    STORAGE_BUCKET: bucket,
    CORS_ORIGINS: `https://${site}.web.app,https://${site}.firebaseapp.com`,
    FIREBASE_WEB_API_KEY: web.apiKey, FIREBASE_AUTH_DOMAIN: web.authDomain, FIREBASE_APP_ID: web.appId,
    PRAISE_BACKEND: config.praiseBackend, GEMINI_MODEL: config.geminiModel || '',
  } });
  run(firebase, ['deploy', '--only', 'hosting', '--project', project, '--non-interactive']);
  const origin = `https://${site}.web.app`;
  for (const [path, expected] of [['/healthz', 200], ['/api/config', 200], ['/api/houses', 401], ['/', 200]]) {
    const response = await fetch(origin + path);
    if (response.status !== expected) throw new Error(`${path}: expected ${expected}, got ${response.status}`);
    if (path === '/api/config') {
      const publicConfig = await response.json();
      if (publicConfig.auth_mode !== 'firebase' || publicConfig.firebase.projectId !== project) throw new Error('Published authentication configuration does not match target project');
    }
  }
  console.log(`Deployed and checked: ${origin}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
