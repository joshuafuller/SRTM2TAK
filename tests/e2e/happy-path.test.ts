import { test, expect } from '@playwright/test';

test.describe('SRTM2TAK Happy Path', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
    
    // Wait for the map to load
    await page.waitForSelector('#map', { state: 'visible' });
  });
  
  test('user selects area and downloads ZIP', async ({ page }) => {
    // Step 1: Wait for map to be interactive
    const map = page.locator('#map');
    await expect(map).toBeVisible();
    
    // Step 2: Enable selection tool
    const selectionButton = page.locator('button[aria-label="Draw rectangle"]');
    await selectionButton.click();
    
    // Step 3: Draw rectangle on map
    // Grand Canyon area: roughly 36°N, -112°W
    const mapBounds = await map.boundingBox();
    if (!mapBounds) throw new Error('Map not visible');
    
    // Calculate positions for Grand Canyon area
    const startX = mapBounds.x + mapBounds.width * 0.3;
    const startY = mapBounds.y + mapBounds.height * 0.4;
    const endX = mapBounds.x + mapBounds.width * 0.5;
    const endY = mapBounds.y + mapBounds.height * 0.6;
    
    // Draw rectangle
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY);
    await page.mouse.up();
    
    // Step 4: Verify tile grid appears
    const tileGrid = page.locator('.tile-grid');
    await expect(tileGrid).toBeVisible();
    
    // Verify tile count is displayed
    const tileCount = page.locator('[data-testid="tile-count"]');
    await expect(tileCount).toContainText(/\d+ tiles? selected/);
    
    // Step 5: Click download button
    const downloadButton = page.locator('button[aria-label="Download tiles"]');
    await expect(downloadButton).toBeEnabled();
    await downloadButton.click();
    
    // Step 6: Monitor progress
    const progressBar = page.locator('[role="progressbar"]');
    await expect(progressBar).toBeVisible();
    
    // Wait for progress to start
    await expect(progressBar).toHaveAttribute('aria-valuenow', /[1-9]/);
    
    // Step 7: Wait for download to complete
    // Set up download promise before the download starts
    const downloadPromise = page.waitForEvent('download');
    
    // Wait for completion (max 60 seconds for slow connections)
    await expect(progressBar).toHaveAttribute('aria-valuenow', '100', {
      timeout: 60000,
    });
    
    // Step 8: Verify ZIP file download
    const download = await downloadPromise;
    
    // Verify filename
    const filename = download.suggestedFilename();
    expect(filename).toMatch(/SRTM_.*\.zip/);
    
    // Verify file size (should be substantial)
    const path = await download.path();
    if (path) {
      const fs = await import('fs');
      const stats = fs.statSync(path);
      expect(stats.size).toBeGreaterThan(1024); // At least 1KB
    }
    
    // Step 9: Verify success message
    const successMessage = page.locator('[role="alert"].success');
    await expect(successMessage).toBeVisible();
    await expect(successMessage).toContainText(/Download complete/i);
  });
  
  test('shows tile information on hover', async ({ page }) => {
    // Enable selection tool
    await page.locator('button[aria-label="Draw rectangle"]').click();
    
    // Draw a selection
    const map = page.locator('#map');
    const bounds = await map.boundingBox();
    if (!bounds) throw new Error('Map not visible');
    
    await page.mouse.move(bounds.x + 100, bounds.y + 100);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 200, bounds.y + 200);
    await page.mouse.up();
    
    // Hover over a tile
    const tile = page.locator('.tile-grid-cell').first();
    await tile.hover();
    
    // Verify tooltip appears
    const tooltip = page.locator('[role="tooltip"]');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText(/N\d+W\d+/); // Tile ID format
    await expect(tooltip).toContainText(/~25MB/); // File size
  });
  
  test('handles memory warning gracefully', async ({ page }) => {
    // Try to select a very large area
    const map = page.locator('#map');
    const bounds = await map.boundingBox();
    if (!bounds) throw new Error('Map not visible');
    
    // Enable selection
    await page.locator('button[aria-label="Draw rectangle"]').click();
    
    // Draw large rectangle (entire visible map)
    await page.mouse.move(bounds.x + 10, bounds.y + 10);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width - 10, bounds.y + bounds.height - 10);
    await page.mouse.up();
    
    // Check for warning if too many tiles
    const tileCount = await page.locator('[data-testid="tile-count"]').textContent();
    const count = parseInt(tileCount?.match(/\d+/)?.[0] || '0');
    
    if (count > 50) {
      const warning = page.locator('[role="alert"].warning');
      await expect(warning).toBeVisible();
      await expect(warning).toContainText(/large selection/i);
    }
  });
  
  test('can cancel download in progress', async ({ page }) => {
    // Start a download
    await page.locator('button[aria-label="Draw rectangle"]').click();
    
    const map = page.locator('#map');
    const bounds = await map.boundingBox();
    if (!bounds) throw new Error('Map not visible');
    
    await page.mouse.move(bounds.x + 100, bounds.y + 100);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 200, bounds.y + 200);
    await page.mouse.up();
    
    await page.locator('button[aria-label="Download tiles"]').click();
    
    // Wait for progress to start
    const progressBar = page.locator('[role="progressbar"]');
    await expect(progressBar).toBeVisible();
    
    // Cancel the download
    const cancelButton = page.locator('button[aria-label="Cancel download"]');
    await expect(cancelButton).toBeVisible();
    await cancelButton.click();
    
    // Verify cancellation
    const cancelMessage = page.locator('[role="alert"]');
    await expect(cancelMessage).toContainText(/cancelled/i);
    
    // Progress bar should disappear
    await expect(progressBar).not.toBeVisible();
  });
  
  test('persists selection after page reload', async ({ page }) => {
    // Make a selection
    await page.locator('button[aria-label="Draw rectangle"]').click();
    
    const map = page.locator('#map');
    const bounds = await map.boundingBox();
    if (!bounds) throw new Error('Map not visible');
    
    await page.mouse.move(bounds.x + 100, bounds.y + 100);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 200, bounds.y + 200);
    await page.mouse.up();
    
    // Get tile count
    const originalCount = await page.locator('[data-testid="tile-count"]').textContent();
    
    // Reload page
    await page.reload();
    
    // Wait for map to load
    await page.waitForSelector('#map', { state: 'visible' });
    
    // Check if selection is restored
    const restoredCount = await page.locator('[data-testid="tile-count"]').textContent();
    expect(restoredCount).toBe(originalCount);
  });
  
  test('works offline after first load', async ({ page, context }) => {
    // Load the app initially
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible' });
    
    // Go offline
    await context.setOffline(true);
    
    // Reload the page
    await page.reload();
    
    // App should still load
    await expect(page.locator('#map')).toBeVisible();
    
    // Should show offline indicator
    const offlineIndicator = page.locator('[data-testid="offline-indicator"]');
    await expect(offlineIndicator).toBeVisible();
    
    // Basic functionality should work
    const selectionButton = page.locator('button[aria-label="Draw rectangle"]');
    await expect(selectionButton).toBeEnabled();
    
    // Go back online
    await context.setOffline(false);
    
    // Offline indicator should disappear
    await expect(offlineIndicator).not.toBeVisible();
  });
  
  test('responsive on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 390, height: 844 });
    
    // Navigate to app
    await page.goto('/');
    
    // Map should be visible
    await expect(page.locator('#map')).toBeVisible();
    
    // Mobile menu button should be visible
    const menuButton = page.locator('button[aria-label="Menu"]');
    await expect(menuButton).toBeVisible();
    
    // Open menu
    await menuButton.click();
    
    // Menu should slide in
    const menu = page.locator('[role="navigation"]');
    await expect(menu).toBeVisible();
    
    // Controls should be accessible
    await expect(page.locator('button[aria-label="Draw rectangle"]')).toBeVisible();
    
    // Close menu
    await page.locator('button[aria-label="Close menu"]').click();
    await expect(menu).not.toBeVisible();
  });
});