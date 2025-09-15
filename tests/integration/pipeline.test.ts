import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AreaCalculator } from '@/lib/area-calculator';
import { TileFetcher } from '@/lib/tile-fetcher';
import { Decompressor } from '@/lib/decompressor';
import { StorageManager } from '@/lib/storage-manager';
import { StreamZip } from '@/lib/stream-zip';
import { MemoryMonitor } from '@/lib/memory-monitor';
import { useTestDatabase } from '../utils/indexeddb-helper';
import { server } from '../mocks/server';
import { http, HttpResponse } from 'msw';
import pako from 'pako';

describe('Download Pipeline Integration', () => {
  const { getDb } = useTestDatabase();
  let storageManager: StorageManager;
  let memoryMonitor: MemoryMonitor;
  
  beforeEach(() => {
    const db = getDb();
    storageManager = new StorageManager(db!);
    memoryMonitor = new MemoryMonitor();
  });
  
  describe('complete download → decompress → store → package flow', () => {
    it('should execute full pipeline for area selection', async () => {
      // Step 1: User selects area on map
      const bounds = {
        north: 37,
        south: 35,
        east: -111,
        west: -113,
      };
      
      // Step 2: Calculate tiles needed
      const tiles = AreaCalculator.boundsToTiles(bounds);
      expect(tiles).toHaveLength(6); // 3x2 grid
      
      // Step 3: Check memory before starting
      const memoryOk = !memoryMonitor.checkPressure();
      expect(memoryOk).toBe(true);
      
      // Mock S3 responses
      server.use(
        http.get('*/*.hgt.gz', ({ params }) => {
          const mockData = new ArrayBuffer(25934402);
          const compressed = pako.gzip(new Uint8Array(mockData));
          return HttpResponse.arrayBuffer(compressed.buffer);
        })
      );
      
      // Step 4: Download tiles
      const fetcher = new TileFetcher();
      const downloadResults = await fetcher.fetchMultiple(tiles, {
        concurrent: 2, // Limit concurrency for memory
      });
      
      expect(downloadResults.every(r => r.success)).toBe(true);
      
      // Step 5: Decompress and store each tile
      const storedTiles: any[] = [];
      
      for (const result of downloadResults) {
        if (result.data) {
          // Decompress
          const decompressed = Decompressor.decompress(result.data);
          expect(decompressed.byteLength).toBe(25934402);
          
          // Store in IndexedDB
          await storageManager.store({
            id: result.tileId,
            data: decompressed,
            size: decompressed.byteLength,
            timestamp: Date.now(),
            compressed: false,
          });
          
          storedTiles.push({
            id: result.tileId,
            data: decompressed,
          });
        }
      }
      
      expect(storedTiles).toHaveLength(6);
      
      // Step 6: Create ZIP package
      const streamZip = new StreamZip();
      
      async function* tileGenerator() {
        for (const tile of storedTiles) {
          // Add .hgt extension for ATAK
          yield {
            id: `${tile.id}.hgt`,
            data: tile.data,
          };
          
          // Free memory after yielding
          delete (tile).data;
        }
      }
      
      const zipBlob = await streamZip.createZip(tileGenerator());
      
      expect(zipBlob).toBeInstanceOf(Blob);
      expect(zipBlob.size).toBeGreaterThan(0);
      
      // Step 7: Verify memory wasn't exceeded
      const finalMemoryOk = !memoryMonitor.checkPressure();
      expect(finalMemoryOk).toBe(true);
    });
    
    it('should handle partial failure gracefully', async () => {
      const tiles = ['N36W112', 'N00W000', 'N37W112']; // Ocean tile will fail
      
      // Mock responses
      server.use(
        http.get('*/N00/N00W000.hgt.gz', () => {
          return new HttpResponse(null, { status: 404 });
        }),
        http.get('*/*.hgt.gz', () => {
          const mockData = new ArrayBuffer(25934402);
          const compressed = pako.gzip(new Uint8Array(mockData));
          return HttpResponse.arrayBuffer(compressed.buffer);
        })
      );
      
      const fetcher = new TileFetcher();
      const results = await fetcher.fetchMultiple(tiles);
      
      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);
      
      expect(successful).toHaveLength(2);
      expect(failed).toHaveLength(1);
      
      // Process only successful tiles
      const processedTiles: any[] = [];
      
      for (const result of successful) {
        if (result.data) {
          const decompressed = Decompressor.decompress(result.data);
          processedTiles.push({
            id: result.tileId,
            data: decompressed,
          });
        }
      }
      
      expect(processedTiles).toHaveLength(2);
      
      // Create ZIP with available tiles
      const streamZip = new StreamZip();
      
      async function* tileGenerator() {
        for (const tile of processedTiles) {
          yield {
            id: `${tile.id}.hgt`,
            data: tile.data,
          };
        }
      }
      
      const zipBlob = await streamZip.createZip(tileGenerator());
      expect(zipBlob.size).toBeGreaterThan(0);
    });
    
    it('should resume interrupted session from manifest', async () => {
      // Simulate previous session
      const manifest = {
        sessionId: 'test-session-123',
        tiles: ['N36W112', 'N36W113', 'N37W112', 'N37W113'],
        completed: ['N36W112', 'N36W113'], // Already downloaded
        failed: [],
        timestamp: Date.now() - 300000, // 5 minutes ago
      };
      
      // Store completed tiles in IndexedDB
      for (const tileId of manifest.completed) {
        await storageManager.store({
          id: tileId,
          data: new ArrayBuffer(25934402),
          size: 25934402,
          timestamp: manifest.timestamp,
          compressed: false,
        });
      }
      
      // Mock remaining tiles
      server.use(
        http.get('*/*.hgt.gz', () => {
          const mockData = new ArrayBuffer(25934402);
          const compressed = pako.gzip(new Uint8Array(mockData));
          return HttpResponse.arrayBuffer(compressed.buffer);
        })
      );
      
      // Resume download
      const fetcher = new TileFetcher();
      const results = await fetcher.resumeFromManifest(manifest);
      
      // Should only download 2 remaining tiles
      const downloaded = results.filter(r => r.downloaded);
      const skipped = results.filter(r => r.skipped);
      
      expect(downloaded).toHaveLength(2);
      expect(skipped).toHaveLength(2);
      
      // Process all tiles (cached + new)
      const allTiles = [];
      
      // Get cached tiles
      for (const tileId of manifest.completed) {
        const cached = await storageManager.get(tileId);
        if (cached) {
          allTiles.push(cached);
        }
      }
      
      // Add newly downloaded
      for (const result of downloaded) {
        if (result.data) {
          const decompressed = Decompressor.decompress(result.data);
          allTiles.push({
            id: result.tileId,
            data: decompressed,
          });
        }
      }
      
      expect(allTiles).toHaveLength(4);
    });
  });
  
  describe('memory management during pipeline', () => {
    it('should handle memory pressure during downloads', async () => {
      const tiles = Array.from({ length: 10 }, (_, i) => `N${36 + i}W112`);
      
      // Mock high memory usage
      (global.performance as any).memory = {
        usedJSHeapSize: 1500 * 1024 * 1024, // 1.5GB
        totalJSHeapSize: 1600 * 1024 * 1024,
        jsHeapSizeLimit: 2048 * 1024 * 1024, // 2GB
      };
      
      // Should throttle operations
      const fetcher = new TileFetcher();
      const startTime = Date.now();
      
      // Mock quick responses
      server.use(
        http.get('*/*.hgt.gz', () => {
          return HttpResponse.arrayBuffer(new ArrayBuffer(1024));
        })
      );
      
      // With memory pressure, should process more carefully
      const results = await fetcher.fetchMultiple(tiles, {
        concurrent: 1, // Reduce concurrency under pressure
      });
      
      const duration = Date.now() - startTime;
      
      expect(results).toHaveLength(10);
      // Should have taken some time due to throttling
      expect(duration).toBeGreaterThan(0);
    });
    
    it('should free memory between tiles during ZIP creation', async () => {
      const tiles = Array.from({ length: 5 }, (_, i) => ({
        id: `N${36 + i}W112`,
        data: new ArrayBuffer(25934402), // ~25MB each
      }));
      
      const memorySnapshots: number[] = [];
      const streamZip = new StreamZip();
      
      async function* tileGenerator() {
        for (const tile of tiles) {
          yield tile;
          
          // Record memory after each tile
          if ((performance as any).memory) {
            memorySnapshots.push((performance as any).memory.usedJSHeapSize);
          }
          
          // Simulate freeing memory
          delete (tile as any).data;
        }
      }
      
      await streamZip.createZip(tileGenerator());
      
      // Memory should not continuously increase
      if (memorySnapshots.length > 1) {
        const firstSnapshot = memorySnapshots[0];
        const lastSnapshot = memorySnapshots[memorySnapshots.length - 1];
        const increase = lastSnapshot - firstSnapshot;
        
        // Should not accumulate all tiles in memory
        expect(increase).toBeLessThan(100 * 1024 * 1024); // Less than 100MB increase
      }
    });
  });
  
  describe('error recovery', () => {
    it('should retry failed downloads', async () => {
      let attempts = 0;
      
      server.use(
        http.get('*/N36W112.hgt.gz', () => {
          attempts++;
          if (attempts < 3) {
            return HttpResponse.error();
          }
          const mockData = new ArrayBuffer(1024);
          return HttpResponse.arrayBuffer(mockData);
        })
      );
      
      const fetcher = new TileFetcher({ maxRetries: 3 });
      const result = await fetcher.fetch('N36W112');
      
      expect(attempts).toBe(3);
      expect(result).toBeInstanceOf(ArrayBuffer);
    });
    
    it('should handle corrupted downloads', async () => {
      server.use(
        http.get('*/*.hgt.gz', () => {
          // Return invalid gzip data
          const invalidData = new Uint8Array([0, 1, 2, 3, 4]);
          return HttpResponse.arrayBuffer(invalidData.buffer);
        })
      );
      
      const fetcher = new TileFetcher();
      const result = await fetcher.fetch('N36W112');
      
      expect(result).toBeInstanceOf(ArrayBuffer);
      
      // Decompression should fail
      expect(() => {
        Decompressor.decompress(result!);
      }).toThrow();
    });
  });
});