// Runs against `npm run dev:emu` (Firebase Emulator Suite). Start that first.
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e-emu', timeout: 60000, workers: 1,
  use: { ...devices['Pixel 7'], baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
});
