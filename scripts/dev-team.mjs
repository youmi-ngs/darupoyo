// Share the local app with real Google sign-in and temporary in-memory records.
// Credentials remain in gcloud's credential store, never in frontend code/files.
import { spawnSync } from 'node:child_process';
const project = 'darupoyo-ontama';
function gcloud(args) {
  const result = spawnSync('gcloud', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) throw new Error(result.stderr.trim() || 'gcloud authentication failed');
  return result.stdout.trim();
}
try {
  const originArg = process.argv[2];
  if (!originArg) throw new Error('Usage: npm run dev:team -- https://YOUR-SHARED-URL');
  const url = new URL(originArg);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Pass the HTTPS origin of the shared app, without a path or invite code');
  }
  const token = gcloud(['auth', 'print-access-token', '--project', project]);
  // Admin SDK needs ADC to validate token revocation, separate from CLI login.
  gcloud(['auth', 'application-default', 'print-access-token', '--project', project]);
  async function request(path, body) {
    const response = await fetch(path, {
      method: body ? 'PATCH' : 'GET',
      headers: { Authorization: `Bearer ${token}`, 'x-goog-user-project': project, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`${response.status}: ${data.error?.message || 'Google API request failed'}`);
    return data;
  }
  const base = `https://firebase.googleapis.com/v1beta1/projects/${project}`;
  const { apps = [] } = await request(`${base}/webApps`);
  const app = apps.find(app => app.displayName === 'darupoyo-web') || (apps.length === 1 ? apps[0] : null);
  if (!app) throw new Error('Register a Firebase Web app named darupoyo-web in Firebase Console first');
  const web = await request(`${base}/webApps/${app.appId}/config`);
  const authBase = `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}`;
  const provider = await request(`${authBase}/defaultSupportedIdpConfigs/google.com`);
  if (!provider.enabled) throw new Error('Enable Google sign-in in Firebase Console → Authentication first');
  const auth = await request(`${authBase}/config`);
  const domains = auth.authorizedDomains || [];
  if (!domains.includes(url.hostname)) {
    await request(`${authBase}/config?updateMask=authorizedDomains`, { authorizedDomains: [...domains, url.hostname] });
  }
  if (!web.apiKey || !web.appId || !web.authDomain) throw new Error('Firebase Web configuration is incomplete');
  Object.assign(process.env, {
    AUTH_MODE: 'firebase', GOOGLE_CLOUD_PROJECT: project, GOOGLE_CLOUD_QUOTA_PROJECT: project,
    FIREBASE_WEB_API_KEY: web.apiKey, FIREBASE_AUTH_DOMAIN: web.authDomain, FIREBASE_APP_ID: web.appId,
    CORS_ORIGINS: `${url.origin},http://127.0.0.1:5173,http://localhost:5173`,
    VITE_API_BASE_URL: '',
  });
  console.log(`Google sign-in enabled for ${url.origin}. Test records reset when the backend restarts.`);
  await import('./dev-all.mjs');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
