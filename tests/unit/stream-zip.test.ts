import { describe, it, expect, beforeEach } from 'vitest';
import { StreamZip } from '@/lib/stream-zip';
import { measureMemoryUsage } from '../utils/memory-monitor';

describe('StreamZip', () => {
  let streamZip: StreamZip;
  
  beforeEach(() => {
    streamZip = new StreamZip();
  });
  
  describe('createZip', () => {
    it('should create ZIP without memory overflow', async () => {
      // Create mock tiles
      const tiles = [
        {
          id: 'N36W112',
          data: new ArrayBuffer(25934402), // ~25MB
        },
        {
          id: 'N36W113',
          data: new ArrayBuffer(25934402),
        },
        {
          id: 'N37W112',
          data: new ArrayBuffer(25934402),
        },
      ];
      
      // Measure memory usage during ZIP creation
      const { result, memoryDelta, peakMemory } = await measureMemoryUsage(async () => {
        // Convert to async iterable
        async function* tileGenerator() {
          for (const tile of tiles) {
            yield tile;
          }
        }
        
        return await streamZip.createZip(tileGenerator());
      });
      
      expect(result).toBeInstanceOfBlob();
      expect(result.size).toBeGreaterThan(0);
      
      // Memory should not exceed reasonable threshold
      // Should not hold all tiles in memory at once
      const maxExpectedMemory = 50 * 1024 * 1024; // 50MB max
      expect(peakMemory).toBeLessThan(maxExpectedMemory);
    });
    
    it('should add files sequentially', async () => {
      const processedTiles: string[] = [];
      
      async function* tileGenerator() {
        for (const tileId of ['N36W112', 'N36W113', 'N37W112']) {
          processedTiles.push(tileId);
          yield {
            id: tileId,
            data: new ArrayBuffer(1024),
          };
        }
      }
      
      const zip = await streamZip.createZip(tileGenerator());
      
      expect(processedTiles).toEqual(['N36W112', 'N36W113', 'N37W112']);
      expect(zip).toBeInstanceOfBlob();
    });
    
    it('should handle write errors gracefully', async () => {
      async function* errorGenerator() {
        yield { id: 'N36W112', data: new ArrayBuffer(1024) };
        throw new Error('Stream error');
      }
      
      await expect(streamZip.createZip(errorGenerator())).rejects.toThrow('Stream error');
    });
    
    it('should compress files in ZIP', async () => {
      // Create compressible data (repeated pattern)
      const data = new Uint8Array(1024 * 1024); // 1MB
      data.fill(42); // Highly compressible
      
      async function* tileGenerator() {
        yield {
          id: 'N36W112',
          data: data.buffer,
        };
      }
      
      const zip = await streamZip.createZip(tileGenerator(), {
        compressionLevel: 9,
      });
      
      // Compressed size should be much smaller
      expect(zip.size).toBeLessThan(data.byteLength / 10);
    });
    
    it('should create valid ZIP structure', async () => {
      async function* tileGenerator() {
        yield {
          id: 'N36W112.hgt',
          data: new ArrayBuffer(25934402),
        };
      }
      
      const zip = await streamZip.createZip(tileGenerator());
      
      // ZIP should have proper magic number
      const arrayBuffer = await zip.arrayBuffer();
      const view = new DataView(arrayBuffer);
      
      // Check for ZIP local file header signature (0x504B0304)
      // ZIP signature is "PK\x03\x04" which is 0x504B0304 in little-endian
      const signature = view.getUint32(0, true);
      expect(signature).toBe(0x04034B50); // Correct little-endian value
    });
  });
  
  describe('createZipWithProgress', () => {
    it('should report progress during ZIP creation', async () => {
      const progressEvents: any[] = [];
      
      async function* tileGenerator() {
        for (let i = 0; i < 5; i++) {
          yield {
            id: `N${36 + i}W112`,
            data: new ArrayBuffer(1024),
          };
        }
      }
      
      const zip = await streamZip.createZipWithProgress(
        tileGenerator(),
        5, // total tiles
        (progress) => {
          progressEvents.push(progress);
        }
      );
      
      expect(zip).toBeInstanceOfBlob();
      expect(progressEvents.length).toBeGreaterThan(0);
      expect(progressEvents[progressEvents.length - 1].percent).toBe(100);
    });
  });
  
  describe('memory management', () => {
    it('should free memory after each tile', async () => {
      const memorySnapshots: number[] = [];
      
      async function* tileGenerator() {
        for (let i = 0; i < 3; i++) {
          // Large tile
          const data = new ArrayBuffer(25934402);
          
          yield {
            id: `N${36 + i}W112`,
            data,
          };
          
          // Check memory after yielding
          if ((performance as any).memory) {
            memorySnapshots.push((performance as any).memory.usedJSHeapSize);
          }
        }
      }
      
      await streamZip.createZip(tileGenerator());
      
      // Memory should not continuously increase
      if (memorySnapshots.length > 1) {
        const memoryIncrease = memorySnapshots[memorySnapshots.length - 1] - memorySnapshots[0];
        expect(memoryIncrease).toBeLessThan(30 * 1024 * 1024); // Less than 30MB increase
      }
    });
  });
  
  describe('error handling', () => {
    it('should handle empty input', async () => {
      async function* emptyGenerator() {
        // No tiles
      }
      
      const zip = await streamZip.createZip(emptyGenerator());
      
      expect(zip).toBeInstanceOfBlob();
      expect(zip.size).toBeGreaterThan(0); // Still has ZIP structure
    });
    
    it('should handle corrupted tile data', async () => {
      async function* corruptGenerator() {
        yield {
          id: 'N36W112',
          data: null as any, // Invalid data
        };
      }
      
      await expect(streamZip.createZip(corruptGenerator())).rejects.toThrow();
    });
  });
});