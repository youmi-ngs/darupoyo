// One-time, rerunnable project setup. Run after gcloud and Firebase CLI login.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(readFileSync(new URL('../deploy/config.json', import.meta.url)));
const firebase = fileURLToPath(new URL('../node_modules/.bin/firebase', import.meta.url));
function run(command, args, json = false) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', stdio: json ? ['ignore', 'pipe', 'inherit'] : 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
  return json ? JSON.parse(result.stdout) : undefined;
}
const { projectId: project, region, repository, runtimeServiceAccount } = config;
const gcloud = (args, json = false) => run('gcloud', [...args, '--project', project, ...(json ? ['--format=json'] : ['--quiet'])], json);
try {
  const billing = gcloud(['billing', 'projects', 'describe', project], true);
  if (!billing.billingEnabled) throw new Error(`Link a billing account to ${project} in Google Cloud Console first`);
  gcloud(['services', 'enable', 'run.googleapis.com', 'cloudbuild.googleapis.com', 'artifactregistry.googleapis.com', 'firestore.googleapis.com', 'identitytoolkit.googleapis.com', 'storage.googleapis.com', 'firebase.googleapis.com', 'firebasehosting.googleapis.com', 'firebaserules.googleapis.com']);
  const projects = run(firebase, ['projects:list', '--json'], true).result;
  if (!projects.some(p => p.projectId === project)) run(firebase, ['projects:addfirebase', project, '--non-interactive']);
  const apps = run(firebase, ['apps:list', 'WEB', '--project', project, '--json'], true).result;
  if (!apps.length) run(firebase, ['apps:create', 'WEB', 'darupoyo-web', '--project', project, '--non-interactive']);
  const databases = gcloud(['firestore', 'databases', 'list'], true);
  if (!databases.some(db => db.name.endsWith('/databases/(default)'))) {
    gcloud(['firestore', 'databases', 'create', '--database=(default)', '--location', region, '--type=firestore-native']);
  }
  const repositories = gcloud(['artifacts', 'repositories', 'list', '--location', region], true);
  if (!repositories.some(repo => repo.name.endsWith('/' + repository))) {
    gcloud(['artifacts', 'repositories', 'create', repository, '--location', region, '--repository-format=docker']);
  }
  const email = `${runtimeServiceAccount}@${project}.iam.gserviceaccount.com`;
  const accounts = gcloud(['iam', 'service-accounts', 'list'], true);
  if (!accounts.some(account => account.email === email)) {
    gcloud(['iam', 'service-accounts', 'create', runtimeServiceAccount, '--display-name=Darupoyo Cloud Run runtime']);
  }
  for (const role of ['roles/datastore.user', 'roles/firebaseauth.viewer']) {
    gcloud(['projects', 'add-iam-policy-binding', project, '--member', `serviceAccount:${email}`, '--role', role, '--condition=None']);
  }
  const appList = run(firebase, ['apps:list', 'WEB', '--project', project, '--json'], true).result;
  const app = config.webAppId ? appList.find(a => a.appId === config.webAppId) : appList.length === 1 ? appList[0] : null;
  if (!app) throw new Error('Set webAppId in deploy/config.json');
  const web = run(firebase, ['apps:sdkconfig', 'WEB', app.appId, '--project', project, '--json'], true).result.sdkConfig;
  const storageBucket = config.storageBucket || web.storageBucket;
  if (!storageBucket) throw new Error('Configure a storage bucket before setup');
  const buckets = gcloud(['storage', 'buckets', 'list'], true);
  if (!buckets.some(bucket => bucket.name === storageBucket || bucket.name === `gs://${storageBucket}/`)) {
    gcloud(['storage', 'buckets', 'create', `gs://${storageBucket}`, '--location', region, '--uniform-bucket-level-access', '--public-access-prevention']);
  }
  for (const role of ['roles/storage.objectCreator', 'roles/storage.objectViewer']) {
    gcloud(['storage', 'buckets', 'add-iam-policy-binding', `gs://${storageBucket}`, '--member', `serviceAccount:${email}`, '--role', role]);
  }
  await import('./setup-account-deletion.mjs');
  console.log(`Cloud resources ready. Enable Google sign-in in https://console.firebase.google.com/project/${project}/authentication/providers then run npm run deploy.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
