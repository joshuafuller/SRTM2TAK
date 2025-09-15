/**
 * E2E Test Setup - Mocks S3 to avoid hitting real AWS endpoints
 */

import { test as base } from '@playwright/test';
import { getTestTileData, TEST_OCEAN_TILES } from '../mocks/handlers';

// Environment variable to enable real S3 testing (disabled by default)
const USE_REAL_S3 = process.env.TEST_REAL_S3 === 'true';

// Extend base test to include S3 mocking
export const test = base.extend({
  // Auto-fixture that runs for every test
  page: async ({ page }, use) => {
    // Only mock if not using real S3 and not simulating errors
    if (!USE_REAL_S3 && !process.env.SIMULATE_NETWORK_ERROR) {
      // Route S3 requests through our mock
      await page.route('**/elevation-tiles-prod/**', async (route) => {
        const url = new URL(route.request().url());
        const pathParts = url.pathname.split('/');
        const folder = pathParts[pathParts.length - 2];
        const filename = pathParts[pathParts.length - 1];
        
        const tileId = filename.replace('.hgt.gz', '');
        
        // Check if it's an ocean tile
        if (TEST_OCEAN_TILES.has(tileId)) {
          // Return 404 for ocean tiles
          await route.fulfill({
            status: 404,
            contentType: 'application/xml',
            body: `<?xml version="1.0" encoding="UTF-8"?>
<Error>
  <Code>NoSuchKey</Code>
  <Message>The specified key does not exist.</Message>
  <Key>elevation-tiles-prod/skadi/${folder}/${filename}</Key>
  <RequestId>MOCK123456789</RequestId>
  <HostId>MockHostId123456789</HostId>
</Error>`,
            headers: {
              'x-amz-request-id': 'MOCK123456789',
              'x-amz-id-2': 'MockHostId123456789',
            },
          });
        } else {
          // Generate mock SRTM data
          const { gzipped } = getTestTileData(tileId);
          
          await route.fulfill({
            status: 200,
            contentType: 'application/gzip',
            body: gzipped,
            headers: {
              'Content-Encoding': 'gzip',
              'Cache-Control': 'public, max-age=31536000',
              'ETag': `"${tileId}-mock"`,
              'Last-Modified': 'Wed, 01 Jan 2020 00:00:00 GMT',
              'x-amz-request-id': 'MOCK123456789',
              'x-amz-id-2': 'MockHostId123456789',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, HEAD',
              'Access-Control-Max-Age': '3600',
            },
          });
        }
      });
      
      console.log('🔒 E2E tests using MOCK S3 server (set TEST_REAL_S3=true to use real S3)');
    } else {
      console.log('⚠️  E2E tests using REAL S3 server - downloads will be slower');
    }
    
    // Continue with the test
    await use(page);
  },
});

export { expect } from '@playwright/test';