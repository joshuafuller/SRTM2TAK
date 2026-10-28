import {
  expect,
  expectTileCount,
  fulfillMockS3Route,
  openApp,
  readDownloadedZip,
  selectPikesPeakArea,
  selectPikesPeakTile,
  test,
} from './setup';

test.describe('SRTM2TAK browser flow', () => {
  test('downloads a selected SRTM tile as a valid ZIP', async ({ page }) => {
    const s3Requests: string[] = [];

    page.on('request', (request) => {
      if (request.url().includes('s3.amazonaws.com/elevation-tiles-prod')) {
        s3Requests.push(request.url());
      }
    });

    await openApp(page);
    await selectPikesPeakTile(page);
    await expectTileCount(page, 1);
    await expect(page.locator('#download-button')).toBeEnabled();

    const downloadPromise = page.waitForEvent('download');
    await page.click('#download-button');
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.zip$/);
    expect(s3Requests).toHaveLength(1);

    // Assert UI completion state before the heavy ZIP read below: the success
    // notification auto-dismisses after a few seconds, so inflating the ~26MB
    // tile first would race the toast off-screen on slow CI runners.
    await expect(page.locator('#progress-overlay')).not.toBeVisible();
    await expect(page.locator('#notifications .notification.success')).toContainText('Download complete');

    const { data, zip } = await readDownloadedZip(download);
    expect(data.byteLength).toBeGreaterThan(1024);
    // Deflated: a stored (level 0) 26 MB tile would make the ZIP over 25 MB
    expect(data.byteLength).toBeLessThan(20_000_000);

    const files = Object.keys(zip.files);
    expect(files).toEqual(['N38W106.hgt']);

    const tileData = await zip.files['N38W106.hgt'].async('arraybuffer');
    expect(tileData.byteLength).toBe(25_934_402);
  });

  test('clears a deterministic area selection', async ({ page }) => {
    await openApp(page);
    await selectPikesPeakArea(page);

    await expectTileCount(page, 4);
    await expect(page.locator('#download-button')).toBeEnabled();

    await page.click('#clear-selection');

    await expectTileCount(page, 0);
    await expect(page.locator('#download-button')).toBeDisabled();
  });

  test('mouse drag creates an area selection on the map', async ({ page }) => {
    await openApp(page);

    const map = page.locator('#map');
    const bounds = await map.boundingBox();
    if (!bounds) throw new Error('Map is not visible');

    await page.click('#draw-rectangle');
    await page.mouse.move(bounds.x + bounds.width * 0.45, bounds.y + bounds.height * 0.45);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * 0.55, bounds.y + bounds.height * 0.55, { steps: 8 });
    await page.mouse.up();

    await expect(page.locator('#tile-count')).toHaveText(/^[1-9]\d* tiles?/);
    await expect(page.locator('#download-button')).toBeEnabled();
  });

  test('selection mode disables touch gestures while active', async ({ page }) => {
    await openApp(page);

    const drawButton = page.locator('#draw-rectangle');
    const canvas = page.locator('#map canvas');

    await drawButton.click();
    await expect(drawButton).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(() => canvas.evaluate((el) => (el as HTMLCanvasElement).style.touchAction))
      .toBe('none');

    await drawButton.click();
    await expect(drawButton).toHaveAttribute('aria-pressed', 'false');
    await expect
      .poll(() => canvas.evaluate((el) => (el as HTMLCanvasElement).style.touchAction))
      .toBe('');
  });

  test('cancels an in-progress download', async ({ page }) => {
    await page.route('**/elevation-tiles-prod/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      try {
        await fulfillMockS3Route(route);
      } catch {
        // The browser may have already aborted the request after cancellation.
      }
    });

    await openApp(page);
    await selectPikesPeakTile(page);
    await expectTileCount(page, 1);

    await page.click('#download-button');
    await expect(page.locator('#progress-overlay')).toBeVisible();

    await page.click('#cancel-download');

    await expect(page.locator('#progress-overlay')).not.toBeVisible();
    await expect(page.locator('#notifications .notification.warning')).toContainText('Download cancelled');
    await expectTileCount(page, 0);
  });

  test('a cancelled download does not save a file after a new download starts', async ({ page }) => {
    let s3Requests = 0;
    await page.route('**/elevation-tiles-prod/**', async (route) => {
      s3Requests++;
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      try {
        await fulfillMockS3Route(route);
      } catch {
        // The browser may have already aborted the request after cancellation.
      }
    });
    const downloads: string[] = [];
    page.on('download', (download) => downloads.push(download.suggestedFilename()));

    await openApp(page);
    await selectPikesPeakTile(page);
    await page.click('#download-button');
    await expect(page.locator('#progress-overlay')).toBeVisible();
    await page.click('#cancel-download');
    await expect(page.locator('#progress-overlay')).not.toBeVisible();

    // Start a new download while the cancelled one could still be running
    await selectPikesPeakTile(page);
    const downloadPromise = page.waitForEvent('download');
    await page.click('#download-button');
    await downloadPromise;
    await expect(page.locator('#notifications .notification.success')).toContainText('Download complete');

    // Give a leftover run time to finish (route delay + fetcher retry backoff)
    await page.waitForTimeout(5_000);
    expect(downloads).toHaveLength(1);
    // The cancelled run must not retry its aborted request
    expect(s3Requests).toBe(2);
  });

  test('reports a tile that failed with a server error', async ({ page }) => {
    await page.route('**/elevation-tiles-prod/**', async (route) => {
      if (route.request().url().includes('N39W105')) {
        await route.fulfill({ status: 500, body: 'Internal Server Error', headers: { 'Access-Control-Allow-Origin': '*' } });
        return;
      }
      await fulfillMockS3Route(route);
    });

    await openApp(page);
    await selectPikesPeakArea(page);
    await expectTileCount(page, 4);

    const downloadPromise = page.waitForEvent('download');
    await page.click('#download-button');
    const download = await downloadPromise;

    await expect(page.locator('#notifications .notification.warning')).toContainText('N39W105');
    const { zip } = await readDownloadedZip(download);
    expect(Object.keys(zip.files)).toContain('N38W106.hgt');
    expect(Object.keys(zip.files)).not.toContain('N39W105.hgt');
  });

  test('shows one error message when every tile fails', async ({ page }) => {
    await page.route('**/elevation-tiles-prod/**', (route) =>
      route.fulfill({ status: 500, body: 'Internal Server Error', headers: { 'Access-Control-Allow-Origin': '*' } })
    );

    await openApp(page);
    await selectPikesPeakTile(page);
    await page.click('#download-button');

    const errors = page.locator('#notifications .notification.error');
    await expect(errors.first()).toContainText('All 1 tiles failed');
    // Watch for a second copy for a while (it used to appear right after the first)
    let most = 0;
    for (let i = 0; i < 10; i++) {
      most = Math.max(most, await errors.count());
      await page.waitForTimeout(100);
    }
    expect(most).toBe(1);
  });

  test('mobile viewport exposes settings without hiding map controls', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openApp(page);

    await expect(page.locator('#map')).toBeVisible();
    await expect(page.locator('#draw-rectangle')).toBeVisible();

    await page.click('#menu-toggle');
    await expect(page.locator('#settings-panel')).toHaveClass(/open/);

    await page.click('#close-settings');
    await expect(page.locator('#settings-panel')).not.toHaveClass(/open/);
  });
});
