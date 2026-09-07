import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PRODUCTION_PORT ?? 4176);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('Invalid production test port');
export default defineConfig({
  testDir: './e2e-production',
  outputDir: './test-results/production',
  forbidOnly: !!process.env.CI,
  workers: 1,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${port}`,
    locale: 'en-US',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm exec -- vite preview --port ${port} --strictPort`,
    cwd: 'frontend',
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
  },
});
