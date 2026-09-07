import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PLAYWRIGHT_PORT must be an integer from 1 to 65535.');
}
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 2,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: process.env.PLAYWRIGHT_CHANNEL },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort --force`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120000,
    cwd: 'frontend',
    env: {
      ...process.env,
      VITE_MOCK_AUTH: 'true',
      VITE_API_URL: 'https://mock-api.test',
    },
  },
});
