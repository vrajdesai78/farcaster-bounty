import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: {baseURL: 'http://127.0.0.1:5187', launchOptions: {channel: process.env.PLAYWRIGHT_CHANNEL || undefined}},
  webServer: {command: 'PORT=5187 npm run dev', url: 'http://127.0.0.1:5187', reuseExistingServer: !process.env.CI},
});
