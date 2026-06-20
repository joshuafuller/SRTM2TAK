/**
 * Characterization tests for the selection info panel.
 *
 * These pin the CURRENT behavior of #download-size, #coverage-area, #areas-list,
 * #info-panel visibility, and the download button across the store-driven and
 * mouse-drag selection paths. They exist to make the in-progress SelectionStore
 * consolidation safe: any change to the dual-source-of-truth must keep these green.
 */
import { expect, expectTileCount, openApp, selectPikesPeakArea, selectPikesPeakTile, test } from './setup';

test.describe('selection info panel (characterization)', () => {
  test('store-driven area selection populates the full info panel', async ({ page }) => {
    await openApp(page);

    // Panel starts empty/hidden with zeroed readouts. NOTE: the legacy path runs on
    // init and formats the empty size as "0 Bytes" (via estimateFileSizes), overwriting
    // the static "0 MB" in the HTML — a dual-path quirk this test deliberately pins.
    await expect(page.locator('#tile-count')).toHaveText('0 tiles');
    await expect(page.locator('#download-size')).toHaveText('0 Bytes');
    await expect(page.locator('#coverage-area')).toHaveText('0°×0°');
    await expect(page.locator('#download-button')).toBeDisabled();

    await selectPikesPeakArea(page);

    // 4-tile area around Pikes Peak.
    await expectTileCount(page, 4);
    await expect(page.locator('#download-button')).toBeEnabled();
    await expect(page.locator('#info-panel')).not.toHaveClass(/hidden/);

    // Store path renders the friendly-name readouts (these exact values are
    // deterministic for the fixed Pikes Peak bounds and pin the new code path).
    await expect(page.locator('#download-size')).toHaveText('26.0 MB');
    await expect(page.locator('#coverage-area')).toHaveText('Colorado Area (4 tiles)');

    // Areas list shows the three named area chips.
    await expect(page.locator('#areas-section')).toBeVisible();
    await expect(page.locator('#areas-list .area-item')).toHaveText([
      'Southern Colorado (2 tiles)',
      'Southwest of Denver',
      'South of Denver',
    ]);
  });

  test('store-driven single-tile selection enables download and shows the panel', async ({ page }) => {
    await openApp(page);
    await selectPikesPeakTile(page);

    await expectTileCount(page, 1);
    await expect(page.locator('#download-button')).toBeEnabled();
    await expect(page.locator('#info-panel')).not.toHaveClass(/hidden/);
    await expect(page.locator('#download-size')).toHaveText('6.5 MB');
    await expect(page.locator('#coverage-area')).toHaveText('Southern Colorado');
  });

  test('mouse-drag selection drives the same panel readouts', async ({ page }) => {
    await openApp(page);

    const map = page.locator('#map');
    const bounds = await map.boundingBox();
    if (!bounds) throw new Error('Map is not visible');

    await page.click('#draw-rectangle');
    await page.mouse.move(bounds.x + bounds.width * 0.45, bounds.y + bounds.height * 0.45);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * 0.55, bounds.y + bounds.height * 0.55, { steps: 8 });
    await page.mouse.up();

    // Whatever path wins, the panel must reflect a non-empty selection.
    await expect(page.locator('#tile-count')).toHaveText(/^[1-9]\d* tiles?/);
    await expect(page.locator('#download-button')).toBeEnabled();
    await expect(page.locator('#download-size')).not.toHaveText('0 MB');
    await expect(page.locator('#info-panel')).not.toHaveClass(/hidden/);
  });

  test('clearing a selection resets the panel to empty', async ({ page }) => {
    await openApp(page);
    await selectPikesPeakArea(page);
    await expectTileCount(page, 4);

    await page.click('#clear-selection');

    await expectTileCount(page, 0);
    await expect(page.locator('#download-button')).toBeDisabled();
    await expect(page.locator('#coverage-area')).toHaveText('0°×0°');
  });
});
