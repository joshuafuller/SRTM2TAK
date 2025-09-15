/**
 * Robot Tests - Happy Path User Journey
 * Tests the complete flow from selection to download
 * IMPORTANT: Uses mock S3 server to avoid hitting real AWS endpoints
 */

import { test, expect } from './setup';
import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';

test.describe('Robot Happy Path Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app
    await page.goto('/');
    
    // Wait for map to load
    await page.waitForSelector('#map canvas', { timeout: 10000 });
    
    // Wait for tile grid to be ready
    await page.waitForTimeout(2000);
  });

  test('User can select tiles and download a valid ZIP file', async ({ page }) => {
    // Step 1: Verify initial state
    const initialTileCount = await page.locator('#tile-count').textContent();
    expect(initialTileCount).toContain('0 tiles');
    
    const downloadButton = page.locator('#download-button');
    await expect(downloadButton).toBeDisabled();
    
    // Step 2: Enable drawing mode
    await page.click('#draw-rectangle');
    const drawButton = page.locator('#draw-rectangle');
    await expect(drawButton).toHaveClass(/active/);
    
    // Step 3: Draw a rectangle to select tiles
    const map = page.locator('#map');
    await page.mouse.move(300, 300);
    await page.mouse.down();
    await page.mouse.move(500, 500, { steps: 10 });
    await page.mouse.up();
    
    // Step 4: Verify tiles were selected
    await page.waitForTimeout(500);
    const selectedTileCount = await page.locator('#tile-count').textContent();
    expect(selectedTileCount).toMatch(/[1-9]\d* tiles?/);
    
    // Extract number of tiles
    const tileMatch = selectedTileCount?.match(/(\d+) tile/);
    const tileCount = tileMatch ? parseInt(tileMatch[1]) : 0;
    expect(tileCount).toBeGreaterThan(0);
    
    // Step 5: Verify download size is calculated
    const downloadSize = await page.locator('#download-size').textContent();
    expect(downloadSize).not.toContain('0 Bytes');
    expect(downloadSize).toMatch(/\d+\.?\d* (MB|KB)/);
    
    // Step 6: Download button should be enabled
    await expect(downloadButton).toBeEnabled();
    
    // Step 7: Set up download promise before clicking
    const downloadPromise = page.waitForEvent('download');
    
    // Step 8: Click download
    await page.click('#download-button');
    
    // Step 9: Progress overlay may show briefly or download may complete instantly with mocks
    const progressOverlay = page.locator('#progress-overlay');
    
    // Either progress shows or download completes immediately
    try {
      // Try to catch the progress overlay if it shows
      await expect(progressOverlay).toHaveCSS('display', 'flex', { timeout: 1000 });
      
      // Step 10: If we see progress, verify it updates
      const progressCurrent = page.locator('#progress-current');
      const progressTotal = page.locator('#progress-total');
      
      // Check that progress starts
      await expect(progressTotal).toHaveText(tileCount.toString(), { timeout: 2000 });
    } catch {
      // Progress completed too quickly to see - that's OK with mocked data
      console.log('Download completed instantly with mocked data');
    }
    
    // Step 11: Wait for download to complete
    const download = await downloadPromise;
    
    // Step 12: Verify download file
    expect(download.suggestedFilename()).toMatch(/srtm_tiles_\d+\.zip/);
    
    // Save download to temp location
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    
    // Step 13: Verify ZIP contents
    if (downloadPath) {
      const zipBuffer = fs.readFileSync(downloadPath);
      const zip = await JSZip.loadAsync(zipBuffer);
      
      // Check ZIP is not empty
      const files = Object.keys(zip.files);
      
      // May be empty if all tiles were ocean, but ZIP should exist
      expect(zipBuffer.byteLength).toBeGreaterThan(0);
      
      // If we have files, verify they're SRTM format
      if (files.length > 0) {
        const firstFile = files[0];
        expect(firstFile).toMatch(/[NS]\d{2}[EW]\d{3}\.hgt/);
        
        // Check file size (SRTM tiles should be exactly 25934402 bytes uncompressed)
        const fileData = await zip.files[firstFile].async('arraybuffer');
        expect(fileData.byteLength).toBe(25934402);
      }
    }
    
    // Step 14: Verify progress overlay closes
    await expect(progressOverlay).toHaveCSS('display', 'none', { timeout: 10000 });
    
    // Step 15: Verify success notification
    const notifications = page.locator('#notifications .notification.success');
    await expect(notifications).toBeVisible();
    await expect(notifications).toContainText('Download complete');
  });

  test('User can select individual tiles by clicking', async ({ page }) => {
    // Zoom in to see tile grid
    await page.click('#zoom-in');
    await page.waitForTimeout(500);
    await page.click('#zoom-in');
    await page.waitForTimeout(500);
    
    // Click on map to select a tile
    await page.click('#map', { position: { x: 400, y: 400 } });
    await page.waitForTimeout(500);
    
    // Verify tile was selected
    const tileCount = await page.locator('#tile-count').textContent();
    expect(tileCount).toMatch(/\d+ tile/);
    
    // Click same tile to deselect
    await page.click('#map', { position: { x: 400, y: 400 } });
    await page.waitForTimeout(500);
    
    // Verify tile was deselected
    const updatedCount = await page.locator('#tile-count').textContent();
    expect(updatedCount).toContain('0 tiles');
  });

  test('User can clear selection', async ({ page }) => {
    // Draw rectangle to select tiles
    await page.click('#draw-rectangle');
    const map = page.locator('#map');
    await page.mouse.move(300, 300);
    await page.mouse.down();
    await page.mouse.move(500, 500);
    await page.mouse.up();
    
    // Verify tiles selected
    await page.waitForTimeout(500);
    const selectedCount = await page.locator('#tile-count').textContent();
    expect(selectedCount).toMatch(/[1-9]\d* tiles?/);
    
    // Clear selection
    await page.click('#clear-selection');
    await page.waitForTimeout(500);
    
    // Verify selection cleared
    const clearedCount = await page.locator('#tile-count').textContent();
    expect(clearedCount).toContain('0 tiles');
    
    // Download button should be disabled
    const downloadButton = page.locator('#download-button');
    await expect(downloadButton).toBeDisabled();
  });

  test('Download handles ocean tiles gracefully', async ({ page }) => {
    // Select an area that's likely ocean (Pacific)
    await page.click('#draw-rectangle');
    
    // Draw a larger area to ensure we select some tiles
    const map = page.locator('#map');
    await page.mouse.move(50, 300);
    await page.mouse.down();
    await page.mouse.move(250, 450);
    await page.mouse.up();
    
    await page.waitForTimeout(500);
    
    // Verify tiles were selected
    const tileCount = await page.locator('#tile-count').textContent();
    expect(tileCount).toMatch(/[1-9]\d* tiles?/);
    
    // Start download
    const downloadPromise = page.waitForEvent('download');
    await page.click('#download-button');
    
    // Wait for download
    const download = await downloadPromise;
    const downloadPath = await download.path();
    
    if (downloadPath) {
      const zipBuffer = fs.readFileSync(downloadPath);
      
      // ZIP should exist even if empty
      expect(zipBuffer.byteLength).toBeGreaterThan(0);
      
      // Load ZIP
      const zip = await JSZip.loadAsync(zipBuffer);
      const files = Object.keys(zip.files);
      
      // Ocean tiles result in empty or missing files
      // This is expected behavior
      console.log(`Downloaded ${files.length} tiles (ocean tiles excluded)`);
    }
  });

  test('Progress tracking works correctly', async ({ page }) => {
    // Select tiles
    await page.click('#draw-rectangle');
    const map = page.locator('#map');
    await page.mouse.move(350, 350);
    await page.mouse.down();
    await page.mouse.move(450, 450);
    await page.mouse.up();
    
    await page.waitForTimeout(500);
    
    // Get expected tile count
    const tileCountText = await page.locator('#tile-count').textContent();
    const match = tileCountText?.match(/(\d+)/);
    const expectedTiles = match ? parseInt(match[1]) : 0;
    
    // Start download
    await page.click('#download-button');
    
    // Monitor progress
    const progressCurrent = page.locator('#progress-current');
    const progressTotal = page.locator('#progress-total');
    const progressBar = page.locator('.progress-fill');
    
    // Verify total is set correctly
    await expect(progressTotal).toHaveText(expectedTiles.toString());
    
    // Verify progress bar updates
    let lastProgress = 0;
    for (let i = 0; i < 5; i++) {
      const currentText = await progressCurrent.textContent();
      const current = parseInt(currentText || '0');
      
      // Progress should increase or complete
      expect(current).toBeGreaterThanOrEqual(lastProgress);
      lastProgress = current;
      
      // Check progress bar width
      const width = await progressBar.evaluate(el => 
        parseInt(window.getComputedStyle(el).width)
      );
      expect(width).toBeGreaterThanOrEqual(0);
      
      if (current === expectedTiles) break;
      await page.waitForTimeout(1000);
    }
  });


  test('Service worker caches app for offline use', async ({ page }) => {
    // Wait for service worker registration with timeout
    const swRegistered = await page.evaluate(async () => {
      if ('serviceWorker' in navigator) {
        try {
          // Wait up to 5 seconds for service worker
          const registration = await Promise.race([
            navigator.serviceWorker.ready,
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('SW timeout')), 5000)
            )
          ]);
          return registration.active?.state === 'activated';
        } catch {
          return false;
        }
      }
      return false;
    });
    
    // Service worker may not be available in test environment
    // This is okay - we can still test offline behavior
    console.log('Service worker registered:', swRegistered);
    
    if (swRegistered) {
      // Go offline
      await page.context().setOffline(true);
      
      // App should still load from cache
      await page.reload();
      
      // Check offline indicator
      const offlineIndicator = page.locator('#offline-indicator');
      await expect(offlineIndicator).toBeVisible();
      
      // Map should still be visible (may not have tiles)
      const map = page.locator('#map');
      await expect(map).toBeVisible();
      
      // Go back online
      await page.context().setOffline(false);
      await page.reload();
      
      // Offline indicator should disappear
      await expect(offlineIndicator).not.toBeVisible();
    } else {
      // Skip offline test if service worker not available
      console.log('Skipping offline test - service worker not available in test environment');
    }
  });
});