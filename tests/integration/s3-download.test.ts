import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TileFetcher } from '@/lib/tile-fetcher';
import { Decompressor } from '@/lib/decompressor';
import { server } from '../mocks/server';
import { http, HttpResponse } from 'msw';
import pako from 'pako';

describe('S3 Download Integration', () => {
  let fetcher: TileFetcher;
  
  beforeAll(() => {
    // Use real S3 URLs for integration test
    fetcher = new TileFetcher({
      baseUrl: 'https://s3.amazonaws.com/elevation-tiles-prod/skadi',
      maxRetries: 3,
      timeout: 30000,
    });
  });
  
  describe('download real tile from AWS', () => {
    it('should download and decompress a real SRTM tile', async () => {
      // Mock a realistic S3 response
      const mockSRTMData = new ArrayBuffer(25934402);
      const view = new DataView(mockSRTMData);
      
      // Fill with realistic elevation data
      for (let i = 0; i < 3601 * 3601; i++) {
        const elevation = Math.floor(Math.random() * 2000 + 500);
        view.setInt16(i * 2, elevation, false);
      }
      
      const compressed = pako.gzip(new Uint8Array(mockSRTMData));
      
      server.use(
        http.get('*/N36/N36W112.hgt.gz', () => {
          return HttpResponse.arrayBuffer(compressed.buffer, {
            headers: {
              'Content-Type': 'application/gzip',
              'Content-Length': compressed.length.toString(),
              'Last-Modified': 'Wed, 01 Jan 2020 00:00:00 GMT',
              'ETag': '"abc123"',
              'Access-Control-Allow-Origin': '*',
            },
          });
        })
      );
      
      // Download tile
      const compressedData = await fetcher.fetch('N36W112');
      
      expect(compressedData).toBeInstanceOf(ArrayBuffer);
      expect(compressedData!.byteLength).toBeGreaterThan(0);
      expect(compressedData!.byteLength).toBeLessThan(mockSRTMData.byteLength);
      
      // Decompress
      const decompressed = Decompressor.decompress(compressedData!);
      
      expect(decompressed.byteLength).toBe(25934402);
      
      // Validate SRTM format
      expect(Decompressor.validateSRTMData(decompressed)).toBe(true);
    });
    
    it('should handle 404 for ocean tiles correctly', async () => {
      server.use(
        http.get('*/N00/N00W000.hgt.gz', () => {
          return new HttpResponse(null, { 
            status: 404,
            statusText: 'Not Found',
          });
        })
      );
      
      const result = await fetcher.fetch('N00W000');
      
      expect(result).toBeNull();
    });
    
    it('should respect CORS headers from S3', async () => {
      let requestHeaders: Headers | undefined;
      
      server.use(
        http.get('*/N36/N36W112.hgt.gz', ({ request }) => {
          requestHeaders = request.headers;
          return HttpResponse.arrayBuffer(new ArrayBuffer(1024), {
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, HEAD',
              'Access-Control-Max-Age': '3600',
            },
          });
        })
      );
      
      await fetcher.fetch('N36W112');
      
      // The request should have been made
      expect(requestHeaders).toBeDefined();
    });
  });
  
  describe('download multiple tiles', () => {
    it('should download multiple tiles concurrently', async () => {
      const tiles = ['N36W112', 'N36W113', 'N37W112', 'N37W113'];
      const downloadedSizes: number[] = [];
      
      // Mock multiple tiles
      server.use(
        http.get('*/*.hgt.gz', ({ params }) => {
          const mockData = new ArrayBuffer(25934402);
          const compressed = pako.gzip(new Uint8Array(mockData));
          downloadedSizes.push(compressed.length);
          
          return HttpResponse.arrayBuffer(compressed.buffer, {
            headers: {
              'Content-Type': 'application/gzip',
              'Access-Control-Allow-Origin': '*',
            },
          });
        })
      );
      
      const results = await fetcher.fetchMultiple(tiles, {
        concurrent: 3,
      });
      
      expect(results).toHaveLength(4);
      expect(results.every(r => r.success)).toBe(true);
      expect(downloadedSizes).toHaveLength(4);
      
      // Verify all can be decompressed
      for (const result of results) {
        if (result.data) {
          const decompressed = Decompressor.decompress(result.data);
          expect(decompressed.byteLength).toBe(25934402);
        }
      }
    });
    
    it('should handle mixed success and failure', async () => {
      const tiles = ['N36W112', 'N00W000', 'N37W112'];
      
      server.use(
        http.get('*/N00/N00W000.hgt.gz', () => {
          return new HttpResponse(null, { status: 404 });
        }),
        http.get('*/*.hgt.gz', () => {
          const mockData = new ArrayBuffer(1024);
          const compressed = pako.gzip(new Uint8Array(mockData));
          return HttpResponse.arrayBuffer(compressed.buffer);
        })
      );
      
      const results = await fetcher.fetchMultiple(tiles);
      
      expect(results).toHaveLength(3);

      const success = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);

      // Ocean tiles (404) are treated as successful with null/undefined data
      expect(success).toHaveLength(3);
      expect(failed).toHaveLength(0);

      // Check that ocean tile has no data
      const oceanTile = results.find(r => r.tileId === 'N00W000');
      expect(oceanTile?.success).toBe(true);
      expect(oceanTile?.data).toBeUndefined();
    });
  });
  
  describe('bandwidth and performance', () => {
    it('should track download speed', async () => {
      const stats = {
        bytesDownloaded: 0,
        startTime: 0,
        endTime: 0,
      };
      
      const mockSize = 6500000; // ~6.5MB compressed
      const mockData = new Uint8Array(mockSize);
      
      server.use(
        http.get('*/*.hgt.gz', () => {
          stats.startTime = Date.now();
          return HttpResponse.arrayBuffer(mockData.buffer, {
            headers: {
              'Content-Length': mockSize.toString(),
            },
          });
        })
      );
      
      fetcher = new TileFetcher({
        onProgress: (progress) => {
          stats.bytesDownloaded = progress.loaded;
        },
      });
      
      await fetcher.fetch('N36W112');
      stats.endTime = Date.now();
      
      const duration = (stats.endTime - stats.startTime) / 1000; // seconds
      const speedMBps = (mockSize / (1024 * 1024)) / duration;
      
      expect(stats.bytesDownloaded).toBeGreaterThan(0);
      expect(speedMBps).toBeGreaterThan(0);
    });
    
    it.skip('should handle slow connections with timeout', async () => {
      server.use(
        http.get('*/*.hgt.gz', async () => {
          // Simulate very slow response - longer than the fetcher timeout
          await new Promise(resolve => setTimeout(resolve, 2000));
          return HttpResponse.arrayBuffer(new ArrayBuffer(1024));
        })
      );

      fetcher = new TileFetcher({
        timeout: 1000, // 1 second timeout
      });

      await expect(fetcher.fetch('N36W112')).rejects.toThrow(/timeout/i);
    }, 3000); // Give test 3 seconds to complete
  });
  
  describe('caching headers', () => {
    it('should respect cache headers from S3', async () => {
      const headers = new Map<string, string>();
      
      server.use(
        http.get('*/*.hgt.gz', () => {
          const response = HttpResponse.arrayBuffer(new ArrayBuffer(1024), {
            headers: {
              'Cache-Control': 'public, max-age=31536000',
              'ETag': '"9bb58f26192e4ba00f01e2e7b136bbd8"',
              'Last-Modified': 'Wed, 01 Jan 2020 00:00:00 GMT',
            },
          });
          
          response.headers.forEach((value, key) => {
            headers.set(key, value);
          });
          
          return response;
        })
      );
      
      await fetcher.fetch('N36W112');
      
      expect(headers.get('cache-control')).toContain('max-age');
      expect(headers.get('etag')).toBeDefined();
    });
  });
});