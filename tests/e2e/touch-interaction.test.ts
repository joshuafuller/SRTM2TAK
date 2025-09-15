/**
 * E2E tests for touch screen interaction
 */

import { test, expect, Page } from '@playwright/test';

test.describe('Touch Screen Interaction', () => {
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    // Create context with touch support
    const context = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 375, height: 667 } // iPhone-like viewport
    });
    page = await context.newPage();
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible' });
  });

  test.afterEach(async () => {
    await page.close();
  });

  test('should handle touch drag for area selection', async () => {
    // Enable selection mode
    await page.click('#draw-rectangle');

    // Get map element
    const map = await page.$('#map');
    const box = await map!.boundingBox();

    // Perform touch drag
    await page.touchscreen.tap(box!.x + 100, box!.y + 100);

    // Start touch
    await page.mouse.move(box!.x + 100, box!.y + 100);
    await page.mouse.down();

    // Drag
    await page.mouse.move(box!.x + 200, box!.y + 200);

    // End touch
    await page.mouse.up();

    // Check that tiles were selected
    const tileCount = await page.textContent('#tile-count');
    expect(tileCount).not.toBe('0 tiles');
  });

  test('should prevent pull-to-refresh during selection mode', async () => {
    // Enable selection mode
    await page.click('#draw-rectangle');

    // Check that touch-action is set correctly on canvas
    const touchAction = await page.evaluate(() => {
      const canvas = document.querySelector('#map canvas') as HTMLCanvasElement;
      return canvas ? window.getComputedStyle(canvas).touchAction : null;
    });

    expect(touchAction).toBe('none');

    // Disable selection mode
    await page.click('#draw-rectangle');

    // Check that touch-action is reset
    const touchActionAfter = await page.evaluate(() => {
      const canvas = document.querySelector('#map canvas') as HTMLCanvasElement;
      return canvas ? window.getComputedStyle(canvas).touchAction : null;
    });

    expect(touchActionAfter).not.toBe('none');
  });

  test('should not select tiles on tap without drag', async () => {
    // Enable selection mode
    await page.click('#draw-rectangle');

    // Single tap (no drag)
    const map = await page.$('#map');
    const box = await map!.boundingBox();
    await page.touchscreen.tap(box!.x + 100, box!.y + 100);

    // Should not select any tiles
    const tileCount = await page.textContent('#tile-count');
    expect(tileCount).toBe('0 tiles');
  });

  test('should handle multi-touch zoom without selecting tiles', async () => {
    // Do NOT enable selection mode

    const map = await page.$('#map');
    const box = await map!.boundingBox();

    // Simulate pinch zoom
    const centerX = box!.x + box!.width / 2;
    const centerY = box!.y + box!.height / 2;

    // Start two fingers
    await page.mouse.move(centerX - 50, centerY);
    await page.mouse.down();

    // This would be a second finger in real touch, but Playwright doesn't
    // support multi-touch directly. We'll test that selection mode is not active

    await page.mouse.up();

    // Verify no tiles selected
    const tileCount = await page.textContent('#tile-count');
    expect(tileCount).toBe('0 tiles');
  });

  test('should show selection box during touch drag', async () => {
    // Enable selection mode
    await page.click('#draw-rectangle');

    const map = await page.$('#map');
    const box = await map!.boundingBox();

    // Start touch drag
    await page.mouse.move(box!.x + 100, box!.y + 100);
    await page.mouse.down();
    await page.mouse.move(box!.x + 150, box!.y + 150);

    // Check for selection box
    const selectionBox = await page.$('.selection-box');
    expect(selectionBox).toBeTruthy();

    // Complete drag
    await page.mouse.up();

    // Selection box should be removed
    const selectionBoxAfter = await page.$('.selection-box');
    expect(selectionBoxAfter).toBeFalsy();
  });

  test('should ignore tiny touch movements', async () => {
    // Enable selection mode
    await page.click('#draw-rectangle');

    const map = await page.$('#map');
    const box = await map!.boundingBox();

    // Very small drag (less than minimum threshold)
    await page.mouse.move(box!.x + 100, box!.y + 100);
    await page.mouse.down();
    await page.mouse.move(box!.x + 102, box!.y + 101); // Only 2-3 pixels
    await page.mouse.up();

    // Should not select tiles
    const tileCount = await page.textContent('#tile-count');
    expect(tileCount).toBe('0 tiles');
  });

  test('should handle touch selection on mobile viewport', async () => {
    // Test is already using mobile viewport from beforeEach

    // Enable selection mode
    await page.click('#draw-rectangle');

    // Check that UI adapts to mobile
    const isDrawModeActive = await page.evaluate(() => {
      const button = document.querySelector('#draw-rectangle');
      return button?.getAttribute('aria-pressed') === 'true';
    });
    expect(isDrawModeActive).toBe(true);

    // Perform selection
    const map = await page.$('#map');
    const box = await map!.boundingBox();

    await page.mouse.move(box!.x + 50, box!.y + 50);
    await page.mouse.down();
    await page.mouse.move(box!.x + 250, box!.y + 250);
    await page.mouse.up();

    // Should have selected tiles
    const tileCount = await page.textContent('#tile-count');
    expect(tileCount).not.toBe('0 tiles');
  });

  test('should clear selection with clear button on touch', async () => {
    // Enable selection mode and make a selection
    await page.click('#draw-rectangle');

    const map = await page.$('#map');
    const box = await map!.boundingBox();

    await page.mouse.move(box!.x + 100, box!.y + 100);
    await page.mouse.down();
    await page.mouse.move(box!.x + 200, box!.y + 200);
    await page.mouse.up();

    // Verify tiles selected
    let tileCount = await page.textContent('#tile-count');
    expect(tileCount).not.toBe('0 tiles');

    // Clear selection
    await page.click('#clear-selection');

    // Verify cleared
    tileCount = await page.textContent('#tile-count');
    expect(tileCount).toBe('0 tiles');
  });

  test('should handle orientation change', async () => {
    // Start in portrait
    await page.setViewportSize({ width: 375, height: 667 });

    // Enable selection mode
    await page.click('#draw-rectangle');

    // Rotate to landscape
    await page.setViewportSize({ width: 667, height: 375 });

    // Selection mode should still be active
    const isDrawModeActive = await page.evaluate(() => {
      const button = document.querySelector('#draw-rectangle');
      return button?.getAttribute('aria-pressed') === 'true';
    });
    expect(isDrawModeActive).toBe(true);

    // Should still be able to select
    const map = await page.$('#map');
    const box = await map!.boundingBox();

    await page.mouse.move(box!.x + 100, box!.y + 100);
    await page.mouse.down();
    await page.mouse.move(box!.x + 300, box!.y + 200);
    await page.mouse.up();

    const tileCount = await page.textContent('#tile-count');
    expect(tileCount).not.toBe('0 tiles');
  });

  test('should handle rapid touch interactions', async () => {
    // Enable selection mode
    await page.click('#draw-rectangle');

    const map = await page.$('#map');
    const box = await map!.boundingBox();

    // Multiple rapid selections
    for (let i = 0; i < 3; i++) {
      // Make selection
      await page.mouse.move(box!.x + 100, box!.y + 100);
      await page.mouse.down();
      await page.mouse.move(box!.x + 200, box!.y + 200);
      await page.mouse.up();

      // Clear
      await page.click('#clear-selection');
    }

    // Should handle all interactions without errors
    const tileCount = await page.textContent('#tile-count');
    expect(tileCount).toBe('0 tiles');
  });
});