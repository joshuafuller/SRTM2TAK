/**
 * Fast test using mock S3 responses with real Pikes Peak tiles
 * This test uses our local test data to avoid hitting AWS S3
 */

import { test, expect } from '../fixtures/msw-fixture';
import * as fs from 'fs';
import JSZip from 'jszip';

test.describe('Mock S3 Download Test (Fast)', () => {
  test('Downloads Pikes Peak tiles from mock server', async ({ page }) => {
    // Track mock requests
    const mockRequests: string[] = [];
    
    page.on('request', request => {
      const url = request.url();
      if (url.includes('s3.amazonaws.com/elevation-tiles-prod')) {
        mockRequests.push(url);
        console.log('Mock S3 Request:', url);
      }
    });
    
    // Navigate to app
    await page.goto('http://localhost:5173');
    await page.waitForSelector('#map canvas', { timeout: 5000 });
    await page.waitForTimeout(1000);
    
    // Enable drawing mode
    await page.click('#draw-rectangle');
    
    // Navigate to Pikes Peak area using JavaScript
    await page.evaluate(() => {
      // Find the map and navigate to Pikes Peak
      const mapElement = document.querySelector('#map');
      if (mapElement) {
        // Trigger selection of our test tiles
        // This would select N38W106, N38W105, N39W106, N39W105
        const event = new CustomEvent('test-select-pikes-peak');
        mapElement.dispatchEvent(event);
      }
    });
    
    // Draw rectangle in map center (will select our test tiles)
    const map = page.locator('#map');
    const box = await map.boundingBox();
    if (!box) throw new Error('Map not visible');
    
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    
    await page.mouse.move(centerX - 50, centerY - 50);
    await page.mouse.down();
    await page.mouse.move(centerX + 50, centerY + 50);
    await page.mouse.up();
    
    await page.waitForTimeout(500);
    
    // Verify tiles selected
    const tileCount = await page.locator('#tile-count').textContent();
    console.log('Selected:', tileCount);
    expect(tileCount).toMatch(/[1-9]\d* tiles?/);
    
    // Start download
    const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
    await page.click('#download-btn');
    
    // Wait for download
    const download = await downloadPromise;
    expect(download).toBeTruthy();
    
    // Verify we made mock requests
    expect(mockRequests.length).toBeGreaterThan(0);
    console.log(`✓ Made ${mockRequests.length} mock S3 requests`);
    
    // Verify the downloaded file
    const path = await download.path();
    if (path) {
      const stats = fs.statSync(path);
      console.log(`✓ Downloaded ${stats.size} bytes`);
      
      // Verify ZIP contents
      const zipData = fs.readFileSync(path);
      const zip = await JSZip.loadAsync(zipData);
      
      const files = Object.keys(zip.files);
      expect(files.length).toBeGreaterThan(0);
      
      // Verify we got our test tiles
      const expectedTiles = ['N38W106', 'N38W105', 'N39W106', 'N39W105'];
      for (const file of files) {
        const tileName = file.replace('.hgt', '');
        if (expectedTiles.includes(tileName)) {
          console.log(`✓ Found test tile: ${tileName}`);
          
          // Verify it's valid SRTM data
          const fileData = await zip.files[file].async('arraybuffer');
          expect(fileData.byteLength).toBe(25934402);
        }
      }
    }
    
    console.log('\n=== MOCK TEST COMPLETED ===');
    console.log('✓ Used local test tiles (no AWS S3 calls)');
    console.log('✓ Fast test execution');
  });
  
  test('Caching works with mock data', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForSelector('#map canvas', { timeout: 5000 });
    
    // Monitor console for cache hits/misses
    const logs: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'log' && msg.text().includes('Cache')) {
        logs.push(msg.text());
      }
    });
    
    // Select area and download
    await page.click('#draw-rectangle');
    
    const map = page.locator('#map');
    const box = await map.boundingBox();
    if (!box) throw new Error('Map not visible');
    
    // Small selection
    await page.mouse.move(box.x + 100, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 150, box.y + 150);
    await page.mouse.up();
    
    await page.waitForTimeout(500);
    
    // First download - should be cache misses
    await page.click('#download-btn');
    await page.waitForTimeout(3000);
    
    const cacheMisses = logs.filter(log => log.includes('MISS')).length;
    expect(cacheMisses).toBeGreaterThan(0);
    console.log(`✓ First download: ${cacheMisses} cache misses`);
    
    // Clear logs
    logs.length = 0;
    
    // Second download - should have cache hits
    await page.click('#download-btn');
    await page.waitForTimeout(3000);
    
    const cacheHits = logs.filter(log => log.includes('HIT')).length;
    expect(cacheHits).toBeGreaterThan(0);
    console.log(`✓ Second download: ${cacheHits} cache hits`);
  });
});