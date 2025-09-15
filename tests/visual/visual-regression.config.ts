import { PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
  testDir: '.',
  testMatch: '*.visual.test.ts',
  
  use: {
    // Visual comparison settings
    ignoreHTTPSErrors: true,
    
    // Screenshot options
    screenshot: {
      mode: 'only-on-failure',
      fullPage: true,
    },
    
    // Visual comparison threshold
    // Lower means more sensitive to changes
    // 0.2 = 20% difference tolerance
    toHaveScreenshot: {
      threshold: 0.2,
      maxDiffPixels: 100,
      animations: 'disabled',
    },
  },
  
  projects: [
    {
      name: 'Desktop Chrome',
      use: {
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
      },
    },
    {
      name: 'Desktop Firefox',
      use: {
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
        channel: 'firefox',
      },
    },
    {
      name: 'Mobile Chrome',
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'Mobile Safari',
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        channel: 'webkit',
      },
    },
    {
      name: 'Tablet',
      use: {
        viewport: { width: 768, height: 1024 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  
  // Store screenshots
  snapshotDir: './screenshots',
  snapshotPathTemplate: '{snapshotDir}/{testFileDir}/{testFileName}-{projectName}-{platform}{ext}',
  
  // Update snapshots with: npm test -- --update-snapshots
  updateSnapshots: 'missing',
};

export default config;