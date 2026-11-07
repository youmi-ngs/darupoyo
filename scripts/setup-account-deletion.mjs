// Narrow, rerunnable permissions for account deletion. Existing read/create roles
// remain unchanged; no authentication-admin or storage-admin role is needed.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const config = JSON.parse(readFileSync(new URL('../deploy/config.json', import.meta.url)));
const project = config.projectId, member = `serviceAccount:${config.runtimeServiceAccount}@${project}.iam.gserviceaccount.com`;
function run(args) {
  const result = spawnSync('gcloud', [...args, '--project', project, '--quiet'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'gcloud failed');
  return result.stdout;
}
const existing = JSON.parse(run(['iam', 'roles', 'list', '--format=json']));
for (const [id, permission, bucket] of [
  ['darupoyoAccountDelete', 'firebaseauth.users.delete', false],
  ['darupoyoMediaDelete', 'storage.objects.delete', true],
]) {
  const role = `projects/${project}/roles/${id}`;
  run(['iam', 'roles', existing.some(r => r.name === role) ? 'update' : 'create', id,
    '--title', id, '--permissions', permission, '--stage=GA']);
  run(bucket
    ? ['storage', 'buckets', 'add-iam-policy-binding', `gs://${config.storageBucket}`, '--member', member, '--role', role]
    : ['projects', 'add-iam-policy-binding', project, '--member', member, '--role', role, '--condition=None']);
  console.log(`Granted ${permission} to the runtime (${bucket ? config.storageBucket : project})`);
}
