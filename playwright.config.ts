import { defineConfig, devices } from '@playwright/test';
import { loadEnv } from 'vite';

const env = loadEnv('production', process.cwd(), ['BASE_PATH']);
const basePath = `${(env.BASE_PATH?.trim() || '/standing-wave/').replace(/\/+$/, '')}/`;
const baseURL = `http://127.0.0.1:5179${basePath}`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
  },
  projects: [
    {
      name: 'desktop-chromium',
      testMatch: /(?:e2e|accessibility|shipping)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile-chromium-portrait',
      testMatch: 'mobile.spec.ts',
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'mobile-chromium-landscape',
      testMatch: 'mobile.spec.ts',
      use: { ...devices['Pixel 7 landscape'] },
    },
  ],
  webServer: {
    command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5179 --strictPort',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
