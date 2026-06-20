/**
 * Opt-in real S3 smoke test.
 *
 * Default e2e runs use Playwright-routed fixture tiles. Run this with
 * TEST_REAL_S3=true when you want to verify the live AWS endpoint.
 */

import { test, expect } from '@playwright/test';
import { openApp, readDownloadedZip, selectPikesPeakTile } from './setup';

const RUN_REAL = process.env.TEST_REAL_S3 === 'true';

test.describe('real S3 download smoke', () => {
  test.skip(!RUN_REAL, 'Set TEST_REAL_S3=true to run live S3 verification');

  test('downloads one live SRTM tile from AWS S3', async ({ page }) => {
    const s3Requests: string[] = [];

    page.on('request', (request) => {
      if (request.url().includes('s3.amazonaws.com/elevation-tiles-prod')) {
        s3Requests.push(request.url());
      }
    });

    await openApp(page);
    await selectPikesPeakTile(page);

    const downloadPromise = page.waitForEvent('download', { timeout: 120_000 });
    await page.click('#download-button');
    const download = await downloadPromise;

    expect(s3Requests).toHaveLength(1);

    const { zip } = await readDownloadedZip(download);
    const files = Object.keys(zip.files);
    expect(files).toEqual(['N38W106.hgt']);

    const tileData = await zip.files['N38W106.hgt'].async('arraybuffer');
    expect(tileData.byteLength).toBe(25_934_402);
  });
});
