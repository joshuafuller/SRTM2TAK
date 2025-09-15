/**
 * Test to verify the app downloads from REAL S3, not mocks
 * This test ensures production app works with actual AWS S3
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import JSZip from 'jszip';

test.describe('Real S3 Download Verification', () => {
  test('Downloads real tiles from AWS S3 (no mocks)', async ({ page }) => {
    // Monitor network requests to verify S3 calls
    const s3Requests: string[] = [];
    
    page.on('request', request => {
      const url = request.url();
      if (url.includes('s3.amazonaws.com/elevation-tiles-prod')) {
        s3Requests.push(url);
        console.log('S3 Request:', url);
      }
    });
    
    page.on('response', response => {
      const url = response.url();
      if (url.includes('s3.amazonaws.com/elevation-tiles-prod')) {
        console.log('S3 Response:', response.status(), url);
      }
    });
    
    // Navigate to app
    await page.goto('http://localhost:5173');
    await page.waitForSelector('#map canvas', { timeout: 10000 });
    await page.waitForTimeout(2000);
    
    // Enable drawing mode
    await page.click('#draw-rectangle');
    
    // Draw a small rectangle to select just 1 tile
    // This minimizes S3 usage while still verifying real downloads
    const map = page.locator('#map');
    const box = await map.boundingBox();
    if (!box) throw new Error('Map not visible');
    
    // Draw small rectangle in center
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    
    await page.mouse.move(centerX - 20, centerY - 20);
    await page.mouse.down();
    await page.mouse.move(centerX + 20, centerY + 20);
    await page.mouse.up();
    
    // Wait for selection
    await page.waitForTimeout(1000);
    
    // Verify tiles selected
    const tileCount = await page.locator('#tile-count').textContent();
    console.log('Selected:', tileCount);
    expect(tileCount).toMatch(/[1-9]\d* tiles?/);
    
    // Start download
    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
    await page.click('#download-btn');
    
    // Wait for download
    const download = await downloadPromise;
    expect(download).toBeTruthy();
    
    // CRITICAL: Verify we made real S3 requests
    expect(s3Requests.length).toBeGreaterThan(0);
    console.log(`✓ Made ${s3Requests.length} real S3 requests`);
    
    // Verify the downloaded file
    const path = await download.path();
    if (path) {
      const stats = fs.statSync(path);
      console.log(`✓ Downloaded ${stats.size} bytes`);
      
      // Verify it's a valid ZIP with SRTM data
      const zipData = fs.readFileSync(path);
      const zip = await JSZip.loadAsync(zipData);
      
      const files = Object.keys(zip.files);
      expect(files.length).toBeGreaterThan(0);
      
      // Check first file is valid SRTM
      const firstFile = files[0];
      expect(firstFile).toMatch(/^[NS]\d{2}[EW]\d{3}\.hgt$/);
      
      const fileData = await zip.files[firstFile].async('arraybuffer');
      expect(fileData.byteLength).toBe(25934402); // Exact SRTM size
      
      console.log(`✓ Valid SRTM data in ZIP: ${firstFile}`);
    }
    
    // Summary
    console.log('\n=== REAL S3 DOWNLOAD VERIFIED ===');
    console.log('✓ App uses real AWS S3, not mocks');
    console.log('✓ Downloaded valid SRTM elevation data');
    console.log(`✓ S3 URLs accessed: ${s3Requests.length}`);
  });
  
  test('Verify no MSW mocks active in production', async ({ page }) => {
    // Check that MSW is not intercepting requests
    await page.goto('http://localhost:5173');
    
    // Try to detect MSW in the browser
    const hasMSW = await page.evaluate(() => {
      // Check for MSW worker
      return navigator.serviceWorker.getRegistrations().then(registrations => {
        for (const reg of registrations) {
          if (reg.active?.scriptURL.includes('mockServiceWorker')) {
            return true;
          }
        }
        return false;
      });
    });
    
    expect(hasMSW).toBe(false);
    console.log('✓ No MSW mock service worker detected');
    
    // Make a test request to S3 to verify it's not mocked
    const response = await page.evaluate(async () => {
      try {
        const resp = await fetch('https://s3.amazonaws.com/elevation-tiles-prod/skadi/N39/N39W105.hgt.gz', {
          method: 'HEAD'
        });
        return {
          status: resp.status,
          headers: {
            server: resp.headers.get('server'),
            'x-amz-request-id': resp.headers.get('x-amz-request-id')
          }
        };
      } catch (error) {
        return { error: error.message };
      }
    });
    
    // Real S3 returns specific headers
    if (response.status === 200) {
      expect(response.headers.server).toContain('AmazonS3');
      console.log('✓ Confirmed real S3 response headers');
    }
  });
});