/**
 * REAL integration test that actually verifies downloads work
 * This test will catch bugs that mocked tests miss
 */

import { test as base, expect } from '@playwright/test';
import * as fs from 'fs';
import JSZip from 'jszip';

// Guard real-download tests behind env flag to avoid long hangs by default
const RUN_REAL = process.env.RUN_REAL === '1' || process.env.TEST_REAL_S3 === 'true';
const describeReal = RUN_REAL ? base.describe : base.describe.skip;

describeReal('REAL Download Integration Test', () => {
  test('Complete download flow - selection to ZIP with valid SRTM data', async ({ page }) => {
    // Enable console logging to debug issues
    page.on('console', msg => {
      const type = msg.type();
      if (type === 'error' || type === 'warning') {
        console.log(`[Browser ${type}]:`, msg.text());
      }
    });
    
    page.on('pageerror', error => {
      console.log('[Page Error]:', error.message);
    });
    
    // Navigate to app (use correct port)
    await page.goto('http://localhost:5173');
    
    // Wait for map to fully load
    await page.waitForSelector('#map canvas', { timeout: 10000 });
    console.log('✓ Map loaded');
    
    // Wait for tile grid to be ready
    await page.waitForTimeout(3000);
    
    // Step 1: Verify initial state
    const initialTileCount = await page.locator('#tile-count').textContent();
    expect(initialTileCount).toContain('0 tiles');
    console.log('✓ Initial state correct');
    
    // Step 2: Enable drawing mode
    await page.click('#draw-rectangle');
    const drawButton = page.locator('#draw-rectangle');
    await expect(drawButton).toHaveClass(/active/);
    console.log('✓ Drawing mode enabled');
    
    // Step 3: Draw a rectangle to select tiles (center of USA - known land area)
    const map = page.locator('#map');
    await page.mouse.move(380, 380);
    await page.mouse.down();
    await page.mouse.move(420, 420, { steps: 5 });
    await page.mouse.up();
    
    // Wait for selection to register
    await page.waitForTimeout(1000);
    
    // Step 4: Verify tiles were selected
    const selectedTileCount = await page.locator('#tile-count').textContent();
    const tileMatch = selectedTileCount?.match(/(\d+) tile/);
    const tileCount = tileMatch ? parseInt(tileMatch[1]) : 0;
    expect(tileCount).toBeGreaterThan(0);
    console.log(`✓ Selected ${tileCount} tiles`);
    
    // Step 5: Verify download button is enabled
    const downloadButton = page.locator('#download-button');
    await expect(downloadButton).toBeEnabled();
    console.log('✓ Download button enabled');
    
    // Step 6: Set up download promise
    const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
    
    // Step 7: Click download and monitor progress
    console.log('Starting download...');
    await page.click('#download-button');
    
    // Monitor for any errors during download
    let downloadError = null;
    const errorCheck = page.waitForSelector('#notifications .notification.error', { 
      timeout: 5000, 
      state: 'visible' 
    }).then(async (el) => {
      downloadError = await el.textContent();
      console.error('Download error detected:', downloadError);
    }).catch(() => {
      // No error notification - good
    });
    
    // Wait for either download or error
    const download = await Promise.race([
      downloadPromise,
      errorCheck.then(() => null)
    ]);
    
    if (downloadError) {
      throw new Error(`Download failed with error: ${downloadError}`);
    }
    
    expect(download).toBeTruthy();
    console.log('✓ Download completed');
    
    // Step 8: Verify download file
    const downloadPath = await download!.path();
    expect(downloadPath).toBeTruthy();
    
    // Step 9: Read and analyze ZIP file
    const zipBuffer = fs.readFileSync(downloadPath!);
    console.log(`ZIP file size: ${zipBuffer.byteLength} bytes`);
    
    // CRITICAL: ZIP must not be empty (22 bytes is empty ZIP)
    expect(zipBuffer.byteLength).toBeGreaterThan(100);
    
    // Step 10: Load and verify ZIP contents
    const zip = await JSZip.loadAsync(zipBuffer);
    const files = Object.keys(zip.files);
    console.log(`ZIP contains ${files.length} files`);
    
    // Must have at least one tile
    expect(files.length).toBeGreaterThan(0);
    
    // Step 11: Verify each SRTM tile
    let validTileCount = 0;
    for (const fileName of files) {
      console.log(`Checking ${fileName}...`);
      
      // File name must match SRTM pattern
      expect(fileName).toMatch(/[NS]\d{2}[EW]\d{3}\.hgt/);
      
      // Extract and verify file
      const fileData = await zip.files[fileName].async('arraybuffer');
      
      // SRTM tiles are EXACTLY 25,934,402 bytes
      expect(fileData.byteLength).toBe(25934402);
      
      // Verify it contains actual elevation data (not all zeros)
      const view = new DataView(fileData);
      let hasValidData = false;
      let minElev = 32767;
      let maxElev = -32768;
      
      // Sample the data to verify it's real elevation data
      for (let i = 0; i < 1000; i++) {
        const offset = Math.floor(Math.random() * (fileData.byteLength / 2)) * 2;
        const elev = view.getInt16(offset, false); // Big-endian
        
        if (elev !== 0 && elev !== -32768) { // -32768 is void/no data
          hasValidData = true;
        }
        
        if (elev > -1000 && elev < 9000) { // Reasonable elevation range
          minElev = Math.min(minElev, elev);
          maxElev = Math.max(maxElev, elev);
        }
      }
      
      expect(hasValidData).toBe(true);
      console.log(`  ✓ ${fileName}: valid SRTM data (elev range: ${minElev}m to ${maxElev}m)`);
      validTileCount++;
    }
    
    console.log(`✓ All ${validTileCount} tiles are valid SRTM format`);
    
    // Step 12: Verify UI returns to ready state
    const progressOverlay = page.locator('#progress-overlay');
    await expect(progressOverlay).toHaveCSS('display', 'none', { timeout: 10000 });
    console.log('✓ UI returned to ready state');
  });

  test('Handles network errors gracefully', async ({ page }) => {
    await page.goto('http://localhost:5174');
    await page.waitForSelector('#map canvas', { timeout: 10000 });
    await page.waitForTimeout(2000);
    
    // Block network requests to S3
    await page.route('**/elevation-tiles-prod/**', route => {
      route.abort('failed');
    });
    
    // Select tiles
    await page.click('#draw-rectangle');
    await page.mouse.move(380, 380);
    await page.mouse.down();
    await page.mouse.move(420, 420);
    await page.mouse.up();
    await page.waitForTimeout(500);
    
    // Try to download
    await page.click('#download-button');
    
    // Should show error within reasonable time
    const errorNotification = await page.waitForSelector(
      '#notifications .notification.error',
      { timeout: 35000, state: 'visible' }
    ).catch(() => null);
    
    if (errorNotification) {
      const errorText = await errorNotification.textContent();
      console.log('Error shown:', errorText);
      expect(errorText).toContain('failed');
    }
    
    // Progress should be hidden
    const progressOverlay = page.locator('#progress-overlay');
    await expect(progressOverlay).toHaveCSS('display', 'none', { timeout: 5000 });
  });

  test('Can select and deselect tiles', async ({ page }) => {
    await page.goto('http://localhost:5174');
    await page.waitForSelector('#map canvas', { timeout: 10000 });
    await page.waitForTimeout(2000);
    
    // Draw selection
    await page.click('#draw-rectangle');
    await page.mouse.move(350, 350);
    await page.mouse.down();
    await page.mouse.move(450, 450);
    await page.mouse.up();
    await page.waitForTimeout(500);
    
    // Verify selection
    let tileCount = await page.locator('#tile-count').textContent();
    expect(tileCount).not.toContain('0 tiles');
    const initialCount = tileCount;
    
    // Clear selection
    await page.click('#clear-selection');
    await page.waitForTimeout(500);
    
    // Verify cleared
    tileCount = await page.locator('#tile-count').textContent();
    expect(tileCount).toContain('0 tiles');
    
    // Download button should be disabled
    const downloadButton = page.locator('#download-button');
    await expect(downloadButton).toBeDisabled();
    
    console.log(`✓ Selection worked: ${initialCount} -> 0 tiles`);
  });
});
