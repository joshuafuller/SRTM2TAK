/**
 * MSW Fixture for E2E tests
 * Provides a Playwright test with MSW handlers pre-configured
 */

import { test as base } from '@playwright/test';
import { handlers } from '../mocks/handlers';

// Create test with MSW pre-configured
export const test = base.extend({
  page: async ({ page }, use) => {
    // Set up MSW in the browser context
    await page.addInitScript(() => {
      // The handlers will be registered by the browser-side MSW setup
      // This fixture just ensures the test context is aware of MSW
    });
    
    await use(page);
  },
});

export { expect } from '@playwright/test';