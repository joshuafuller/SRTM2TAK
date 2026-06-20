/**
 * E2E setup.
 *
 * Browser tests use Playwright routing for S3. MSW remains a Node-only
 * unit/integration test concern.
 */

import { test as base, expect, type Download, type Page, type Route } from '@playwright/test';
import * as fs from 'fs';
import JSZip from 'jszip';
import { TEST_OCEAN_TILES, loadTestTile } from '../fixtures/test-tiles';

interface BoundingBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

const PIKES_PEAK_TILE_BOUNDS: BoundingBox = {
  south: 38,
  north: 38.2,
  west: -106,
  east: -105.8,
};

const PIKES_PEAK_AREA_BOUNDS: BoundingBox = {
  south: 38,
  north: 39.2,
  west: -106,
  east: -104.8,
};

const USE_REAL_S3 = process.env.TEST_REAL_S3 === 'true';

function s3ErrorXml(folder: string, filename: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Error>
  <Code>NoSuchKey</Code>
  <Message>The specified key does not exist.</Message>
  <Key>elevation-tiles-prod/skadi/${folder}/${filename}</Key>
  <RequestId>MOCK123456789</RequestId>
  <HostId>MockHostId123456789</HostId>
</Error>`;
}

function parseTileRequest(route: Route): { folder: string; filename: string; tileId: string } {
  const url = new URL(route.request().url());
  const pathParts = url.pathname.split('/').filter(Boolean);
  const folder = pathParts[pathParts.length - 2] ?? '';
  const filename = pathParts[pathParts.length - 1] ?? '';
  const tileId = filename.replace(/\.hgt\.gz$/, '');

  return { folder, filename, tileId };
}

export async function fulfillMockS3Route(route: Route): Promise<void> {
  const { folder, filename, tileId } = parseTileRequest(route);
  const expectedFolder = tileId.slice(0, 3);

  if (!filename.endsWith('.hgt.gz') || folder !== expectedFolder || TEST_OCEAN_TILES.has(tileId)) {
    await route.fulfill({
      status: 404,
      contentType: 'application/xml',
      body: s3ErrorXml(folder, filename),
      headers: {
        'Access-Control-Allow-Origin': '*',
        'x-amz-request-id': 'MOCK123456789',
        'x-amz-id-2': 'MockHostId123456789',
      },
    });
    return;
  }

  const tileData = loadTestTile(tileId);

  if (!tileData) {
    await route.fulfill({
      status: 404,
      contentType: 'application/xml',
      body: s3ErrorXml(folder, filename),
      headers: {
        'Access-Control-Allow-Origin': '*',
        'x-amz-request-id': 'MOCK123456789',
        'x-amz-id-2': 'MockHostId123456789',
      },
    });
    return;
  }

  await route.fulfill({
    status: 200,
    contentType: 'application/x-gzip',
    body: route.request().method() === 'HEAD' ? undefined : tileData,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD',
      'Cache-Control': 'public, max-age=31536000',
      'Content-Length': tileData.byteLength.toString(),
      'ETag': `"${tileId}-${tileData.byteLength}"`,
      'Last-Modified': 'Wed, 01 Jan 2020 00:00:00 GMT',
      'x-amz-request-id': 'MOCK123456789',
      'x-amz-id-2': 'MockHostId123456789',
    },
  });
}

export const test = base.extend({
  page: async ({ page }, use) => {
    if (!USE_REAL_S3) {
      await page.route('**/elevation-tiles-prod/**', fulfillMockS3Route);
    }

    await use(page);
  },
});

export async function openApp(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('#map canvas', { state: 'visible' });
  await page.waitForFunction(() => Boolean((window as any).appState?.selectionUI));
}

export async function selectArea(page: Page, bounds: BoundingBox): Promise<void> {
  await page.evaluate((selectionBounds) => {
    const appState = (window as any).appState;
    appState.selectionStore.selectArea(selectionBounds);
  }, bounds);
}

export async function selectPikesPeakTile(page: Page): Promise<void> {
  await selectArea(page, PIKES_PEAK_TILE_BOUNDS);
}

export async function selectPikesPeakArea(page: Page): Promise<void> {
  await selectArea(page, PIKES_PEAK_AREA_BOUNDS);
}

export async function expectTileCount(page: Page, count: number): Promise<void> {
  const suffix = count === 1 ? 'tile' : 'tiles';
  await expect(page.locator('#tile-count')).toHaveText(new RegExp(`^${count} ${suffix}( \\(\\d+ cached\\))?$`));
}

export async function readDownloadedZip(download: Download): Promise<{ data: Buffer; zip: JSZip }> {
  const downloadPath = await download.path();
  if (!downloadPath) {
    throw new Error('Playwright did not expose a download path');
  }

  const data = fs.readFileSync(downloadPath);
  const zip = await JSZip.loadAsync(data);
  return { data, zip };
}

export { expect };
