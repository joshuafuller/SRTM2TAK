/**
 * Unit test to verify download flow works end-to-end
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DownloadManager } from '@/lib/download-manager';
import { TileFetcher } from '@/lib/tile-fetcher';
import { StorageManager } from '@/lib/storage-manager';

// Mock the modules
vi.mock('@/lib/tile-fetcher');
vi.mock('@/lib/storage-manager');
vi.mock('@/lib/decompressor', () => ({
  Decompressor: {
    decompress: vi.fn().mockImplementation((data) => {
      // Mock decompression - just return larger data
      const size = 25934402; // SRTM size
      const buffer = new ArrayBuffer(size);
      const view = new DataView(buffer);
      // Add some test data
      for (let i = 0; i < 100; i++) {
        view.setInt16(i * 2, 1000 + i, false);
      }
      return Promise.resolve(buffer);
    })
  }
}));

describe('DownloadManager', () => {
  let manager: DownloadManager;
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock TileFetcher
    const MockedTileFetcher = TileFetcher as any;
    MockedTileFetcher.mockImplementation(() => ({
      fetch: vi.fn().mockImplementation((tileId: string) => {
        // Return mock compressed data
        const data = new ArrayBuffer(1000000); // 1MB compressed
        return Promise.resolve(data);
      })
    }));
    
    // Mock StorageManager  
    const MockedStorageManager = StorageManager as any;
    MockedStorageManager.mockImplementation(() => ({
      init: vi.fn().mockResolvedValue(undefined),
      isInitialized: vi.fn().mockReturnValue(false), // Disable caching for test
      get: vi.fn().mockResolvedValue(null),
      store: vi.fn().mockResolvedValue(undefined)
    }));
    
    manager = new DownloadManager({
      useCache: false
    });
  });
  
  it('should download tiles and create a ZIP blob', async () => {
    const tileIds = ['N39W098', 'N39W099'];
    
    const blob = await manager.startDownload(tileIds);
    
    expect(blob).toBeDefined();
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe('application/zip');
  });
  
  it('should handle ocean tiles (null data)', async () => {
    // Mock fetcher to return null for ocean
    const MockedTileFetcher = TileFetcher as any;
    MockedTileFetcher.mockImplementation(() => ({
      fetch: vi.fn().mockImplementation((tileId: string) => {
        if (tileId === 'N37W123') {
          return Promise.resolve(null); // Ocean tile
        }
        return Promise.resolve(new ArrayBuffer(1000000));
      })
    }));
    
    const manager2 = new DownloadManager({ useCache: false });
    const tileIds = ['N39W098', 'N37W123']; // One land, one ocean
    
    const blob = await manager2.startDownload(tileIds);
    
    expect(blob).toBeDefined();
    expect(blob.size).toBeGreaterThan(0); // Should still have the land tile
  });
});