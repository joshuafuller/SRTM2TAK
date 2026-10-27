import { defineConfig, devices } from '@playwright/test';

// Allow opting into the full cross-browser matrix via env var
const ALL_BROWSERS = process.env.PW_BROWSERS === 'all';
// CI also runs Firefox: Chromium alone missed a Firefox-only blank map
const CI_BROWSERS = !!process.env.CI;
// PW_PREVIEW=1 tests the production build (run `npm run build` first), as deployed to Pages
const USE_PREVIEW = process.env.PW_PREVIEW === '1';

export default defineConfig({
  testDir: './tests/e2e',
  // Parallel across tests, not across a large browser matrix by default
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    // page.route() cannot mock requests made by the service worker in Firefox,
    // so the S3 mocks would be bypassed on the production build
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: ALL_BROWSERS
    ? [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
        { name: 'webkit', use: { ...devices['Desktop Safari'] } },
        { name: 'Mobile Chrome', use: { ...devices['Pixel 5'] } },
        { name: 'Mobile Safari', use: { ...devices['iPhone 12'] } },
      ]
    : CI_BROWSERS
      ? [
          { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
          { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
        ]
      : [
          // Default: single fast project to avoid long installs/hangs locally
          { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        ],

  webServer: {
    // Bind vite explicitly to IPv4 127.0.0.1: on CI runners `localhost` can resolve
    // to IPv6 (::1) while Playwright probes IPv4, so the readiness check never
    // succeeds and the server "times out". --strictPort keeps the port deterministic.
    command: USE_PREVIEW
      ? 'npm run preview -- --host 127.0.0.1 --port 5173 --strictPort'
      : 'npm run dev -- --host 127.0.0.1 --strictPort',
    // Probe the real app path (base is /SRTM2TAK/); the root only 302-redirects.
    url: 'http://127.0.0.1:5173/SRTM2TAK/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
