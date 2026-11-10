import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 120000,
  use: { baseURL: process.env.WEB_PUBLIC_URL || 'http://localhost:3000', channel: process.env.PDF_BROWSER_CHANNEL || undefined },
  webServer: [
    { command: 'pnpm --filter @dms/api start', url: 'http://localhost:4000/api/v1/health', reuseExistingServer: true, cwd: '..' },
    { command: 'pnpm --filter @dms/web dev', url: 'http://localhost:3000', reuseExistingServer: true, cwd: '..' },
  ],
});
