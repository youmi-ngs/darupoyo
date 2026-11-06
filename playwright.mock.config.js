// Frontend alone with the in-browser API mock (no Backend, no Firebase).
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e-mock', timeout: 45000, workers: 1,
  use: { ...devices['Pixel 7'], baseURL: 'http://127.0.0.1:5174' },
  webServer: { command: 'npx vite --host 127.0.0.1 --port 5174', env: { VITE_API_MOCK: '1' }, url: 'http://127.0.0.1:5174', reuseExistingServer: false },
});
