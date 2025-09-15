import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TileFetcher } from '@/lib/tile-fetcher';
import { server } from '../mocks/server';
import { http, HttpResponse } from 'msw';

describe('TileFetcher', () => {
  let fetcher: TileFetcher;
  
  beforeEach(() => {
    fetcher = new TileFetcher({
      baseUrl: 'https://s3.amazonaws.com/elevation-tiles-prod/skadi',
      maxRetries: 3,
      retryDelay: 100,
    });
  });
  
  describe('fetch', () => {
    it('should download tile from S3 URL', async () => {
      const mockData = new Uint8Array(1024).fill(42);
      
      server.use(
        http.get('*/N36/N36W112.hgt.gz', () => {
          return HttpResponse.arrayBuffer(mockData.buffer);
        })
      );
      
      const result = await fetcher.fetch('N36W112');
      
      expect(result).toBeInstanceOf(ArrayBuffer);
      expect(result!.byteLength).toBe(1024);
    });
    
    it('should retry on failure', async () => {
      let attempts = 0;
      
      server.use(
        http.get('*/N36/N36W112.hgt.gz', () => {
          attempts++;
          if (attempts < 3) {
            return HttpResponse.error();
          }
          return HttpResponse.arrayBuffer(new ArrayBuffer(1024));
        })
      );
      
      const result = await fetcher.fetch('N36W112');
      
      expect(attempts).toBe(3);
      expect(result).toBeInstanceOf(ArrayBuffer);
    });
    
    it('should throw after max retries exceeded', async () => {
      server.use(
        http.get('*/N36/N36W112.hgt.gz', () => {
          return HttpResponse.error();
        })
      );
      
      await expect(fetcher.fetch('N36W112')).rejects.toThrow();
    });
    
    it('should handle 404 for ocean tiles', async () => {
      server.use(
        http.get('*/N00/N00W000.hgt.gz', () => {
          return new HttpResponse(null, { status: 404 });
        })
      );
      
      const result = await fetcher.fetch('N00W000');
      
      expect(result).toBeNull();
    });
    
    it('should report progress during download', async () => {
      const progressCallback = vi.fn();
      fetcher = new TileFetcher({
        onProgress: progressCallback,
      });
      
      const mockData = new Uint8Array(1024 * 1024);
      
      server.use(
        http.get('*/N36/N36W112.hgt.gz', () => {
          return HttpResponse.arrayBuffer(mockData.buffer);
        })
      );
      
      await fetcher.fetch('N36W112');
      
      expect(progressCallback).toHaveBeenCalled();
      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          tileId: 'N36W112',
          loaded: expect.any(Number),
          total: expect.any(Number),
        })
      );
    });
  });
  
  describe('fetchMultiple', () => {
    it('should download multiple tiles concurrently', async () => {
      const tiles = ['N36W112', 'N36W113', 'N37W112'];
      
      server.use(
        http.get('*/*.hgt.gz', () => {
          return HttpResponse.arrayBuffer(new ArrayBuffer(1024));
        })
      );
      
      const results = await fetcher.fetchMultiple(tiles, { concurrent: 3 });
      
      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
    });
    
    it('should respect concurrency limit', async () => {
      const tiles = Array.from({ length: 10 }, (_, i) => `N${36 + i}W112`);
      let activeRequests = 0;
      let maxConcurrent = 0;
      
      server.use(
        http.get('*/*.hgt.gz', async () => {
          activeRequests++;
          maxConcurrent = Math.max(maxConcurrent, activeRequests);
          await new Promise(resolve => setTimeout(resolve, 100));
          activeRequests--;
          return HttpResponse.arrayBuffer(new ArrayBuffer(1024));
        })
      );
      
      await fetcher.fetchMultiple(tiles, { concurrent: 3 });
      
      expect(maxConcurrent).toBeLessThanOrEqual(3);
    });
  });
  
  describe('checkTileExists', () => {
    it('should check if tile exists using HEAD request', async () => {
      server.use(
        http.head('*/N36/N36W112.hgt.gz', () => {
          return new HttpResponse(null, { status: 200 });
        })
      );
      
      const exists = await fetcher.checkTileExists('N36W112');
      
      expect(exists).toBe(true);
    });
    
    it('should return false for non-existent tiles', async () => {
      server.use(
        http.head('*/N00/N00W000.hgt.gz', () => {
          return new HttpResponse(null, { status: 404 });
        })
      );
      
      const exists = await fetcher.checkTileExists('N00W000');
      
      expect(exists).toBe(false);
    });
  });
  
  describe('resumeFromManifest', () => {
    it('should resume download from saved manifest', async () => {
      const manifest = {
        sessionId: 'test-session',
        tiles: ['N36W112', 'N36W113', 'N37W112'],
        completed: ['N36W112'],
        failed: [],
        timestamp: Date.now(),
      };
      
      server.use(
        http.get('*/*.hgt.gz', () => {
          return HttpResponse.arrayBuffer(new ArrayBuffer(1024));
        })
      );
      
      const results = await fetcher.resumeFromManifest(manifest);
      
      // Should only download 2 tiles (skipping completed one)
      expect(results.filter(r => r.downloaded)).toHaveLength(2);
      expect(results.find(r => r.tileId === 'N36W112')?.skipped).toBe(true);
    });
  });
});