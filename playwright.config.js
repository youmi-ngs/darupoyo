import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
const backendDir = resolve(process.env.BACKEND_DIR || './backend');
export default defineConfig({
  testDir: './e2e', timeout: 45000, workers: 1,
  use: { ...devices['Pixel 7'], baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure', launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } },
  webServer: [
    { command: 'uv run --python .venv/bin/python --no-project uvicorn src.app.main:app --host 127.0.0.1 --port 8080', cwd: backendDir, env: {APP_ENV:'local', DATA_BACKEND:'memory', AUTH_MODE:'dev', PRAISE_BACKEND:'fallback', CORS_ORIGINS:'http://127.0.0.1:5173'}, url: 'http://127.0.0.1:8080/healthz', reuseExistingServer: !process.env.CI },
    { command: 'npm run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI },
  ],
});
