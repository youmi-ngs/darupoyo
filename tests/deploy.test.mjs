import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('deployment passes the notification sender ID to Cloud Run', () => {
  const dir = mkdtempSync(join(tmpdir(), 'darupoyo-deploy-'));
  try {
    writeFileSync(join(dir, 'gcloud'), `#!/bin/sh
case "$1 $2" in
  "builds submit") echo test-build ;;
  "builds describe") echo SUCCESS ;;
  "run deploy") printf '%s\\n' "$@" > "$DEPLOY_TEST_ARGS" ;;
esac
`, { mode: 0o755 });
    const result = spawnSync('bash', ['backend/scripts/deploy.sh'], {
      encoding: 'utf8', env: { ...process.env, PATH: dir + ':' + process.env.PATH,
        PROJECT_ID: 'demo', REGION: 'asia-northeast1', STORAGE_BUCKET: 'demo', SERVICE_ACCOUNT: 'demo@example.test',
        CORS_ORIGINS: 'https://example.test', PRAISE_BACKEND: 'fallback', FIREBASE_WEB_API_KEY: 'test',
        FIREBASE_AUTH_DOMAIN: 'example.test', FIREBASE_APP_ID: 'test-app', FIREBASE_MESSAGING_SENDER_ID: '123456',
        DEPLOY_TEST_ARGS: join(dir, 'args'),
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(join(dir, 'args'), 'utf8'), /\|FIREBASE_MESSAGING_SENDER_ID=123456\|/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
