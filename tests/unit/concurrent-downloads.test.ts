/**
 * Test to verify concurrent/parallel downloads are working correctly
 * This test should FAIL with the current implementation that downloads sequentially
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DownloadManager } from '@/lib/download-manager';

// Mock the decompressor to avoid errors with test data
vi.mock('@/lib/decompressor', () => ({
  Decompressor: {
    decompress: (data: ArrayBuffer) => data // Just return data as-is for testing
  }
}));

describe('Concurrent Downloads', () => {
  let downloadManager: DownloadManager;
  let fetchSpy: any;
  let downloadTimeline: Array<{ tileId: string; event: 'start' | 'end'; time: number }>;
  let startTime: number;

  beforeEach(() => {
    downloadTimeline = [];
    startTime = Date.now();

    // Mock fetch to track download timeline and simulate delays
    fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
      const tileIdMatch = urlStr.match(/\/([NS]\d{2}[EW]\d{3})\.hgt\.gz$/);
      const tileId = tileIdMatch ? tileIdMatch[1] : 'unknown';

      // Record start time
      downloadTimeline.push({
        tileId,
        event: 'start',
        time: Date.now() - startTime
      });

      // Simulate network delay (200ms per tile)
      await new Promise(resolve => setTimeout(resolve, 200));

      // Record end time
      downloadTimeline.push({
        tileId,
        event: 'end',
        time: Date.now() - startTime
      });

      // Return mock response with compressed data
      const mockData = new Uint8Array(1000).fill(0);
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: {
          get: (name: string) => {
            if (name === 'content-length') return '1000';
            if (name === 'content-type') return 'application/gzip';
            return null;
          }
        },
        body: {
          getReader: () => ({
            read: vi.fn().mockResolvedValueOnce({ done: false, value: mockData })
              .mockResolvedValueOnce({ done: true })
          })
        }
      } as any;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should download tiles concurrently, not sequentially', async () => {
    // Create download manager with concurrency of 3
    downloadManager = new DownloadManager({
      concurrentDownloads: 3,
      useCache: false, // Disable cache to ensure all tiles are downloaded
      retryAttempts: 1,
      retryDelay: 0
    });

    // Test with 6 tiles
    const tiles = [
      'N00E000',
      'N00E001',
      'N00E002',
      'N01E000',
      'N01E001',
      'N01E002'
    ];

    // Start download
    const downloadPromise = downloadManager.startDownload(tiles);

    // Wait for completion
    await downloadPromise;

    // Analyze timeline to check for concurrent downloads
    const concurrentDownloads = analyzeConcurrency(downloadTimeline);

    // With concurrency of 3, we should see at least 3 downloads happening at the same time
    expect(concurrentDownloads.maxConcurrent).toBeGreaterThanOrEqual(3);

    // Total time should be less than sequential time
    // Sequential: 6 tiles * 200ms = 1200ms
    // Concurrent with 3: ~400ms (2 batches of 3)
    const totalTime = Math.max(...downloadTimeline.map(e => e.time));
    expect(totalTime).toBeLessThan(1000); // Should be much less than 1200ms

    // Verify pattern: multiple downloads should start before first ones complete
    const firstThreeStarts = downloadTimeline
      .filter(e => e.event === 'start')
      .slice(0, 3)
      .map(e => e.time);

    const firstComplete = downloadTimeline
      .find(e => e.event === 'end')?.time || Infinity;

    // At least 3 downloads should start before the first one completes
    const startsBeforeFirstComplete = firstThreeStarts.filter(t => t < firstComplete).length;
    expect(startsBeforeFirstComplete).toBeGreaterThanOrEqual(3);
  });

  it('should respect the concurrentDownloads limit', async () => {
    // Test with concurrency of 2
    downloadManager = new DownloadManager({
      concurrentDownloads: 2,
      useCache: false,
      retryAttempts: 1,
      retryDelay: 0
    });

    const tiles = ['N00E000', 'N00E001', 'N00E002', 'N00E003'];

    await downloadManager.startDownload(tiles);

    const concurrentDownloads = analyzeConcurrency(downloadTimeline);

    // Should never exceed 2 concurrent downloads
    expect(concurrentDownloads.maxConcurrent).toBeLessThanOrEqual(2);
    expect(concurrentDownloads.maxConcurrent).toBeGreaterThanOrEqual(2);
  });

  it('should handle mixed cached and non-cached tiles concurrently', async () => {
    // Mock storage to simulate some cached tiles
    const mockStorage = {
      isInitialized: () => true,
      init: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockImplementation(async (id: string) => {
        // First 2 tiles are cached
        if (id === 'N00E000' || id === 'N00E001') {
          return {
            id,
            data: new ArrayBuffer(1000),
            timestamp: Date.now(),
            lastAccessed: Date.now(),
            size: 1000,
            compressed: true
          };
        }
        return null;
      }),
      store: vi.fn().mockResolvedValue(undefined)
    };

    // Create manager with mocked storage
    downloadManager = new DownloadManager({
      concurrentDownloads: 3,
      useCache: true,
      retryAttempts: 1,
      retryDelay: 0
    });

    // Inject mock storage
    (downloadManager as any).storage = mockStorage;

    const tiles = [
      'N00E000', // cached
      'N00E001', // cached
      'N00E002', // not cached
      'N00E003', // not cached
      'N00E004', // not cached
      'N00E005'  // not cached
    ];

    await downloadManager.startDownload(tiles);

    // Filter timeline to only non-cached tiles
    const nonCachedTimeline = downloadTimeline.filter(e =>
      !['N00E000', 'N00E001'].includes(e.tileId)
    );

    const concurrentDownloads = analyzeConcurrency(nonCachedTimeline);

    // Non-cached tiles should still be downloaded concurrently
    expect(concurrentDownloads.maxConcurrent).toBeGreaterThanOrEqual(3);
  });
});

/**
 * Analyze timeline to determine maximum concurrent downloads
 */
function analyzeConcurrency(timeline: Array<{ tileId: string; event: 'start' | 'end'; time: number }>) {
  let maxConcurrent = 0;
  let currentConcurrent = 0;
  const activeTiles = new Set<string>();

  // Sort timeline by time
  const sortedEvents = [...timeline].sort((a, b) => a.time - b.time);

  for (const event of sortedEvents) {
    if (event.event === 'start') {
      activeTiles.add(event.tileId);
      currentConcurrent = activeTiles.size;
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
    } else if (event.event === 'end') {
      activeTiles.delete(event.tileId);
      currentConcurrent = activeTiles.size;
    }
  }

  return {
    maxConcurrent,
    timeline: sortedEvents
  };
}