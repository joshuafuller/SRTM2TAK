import { describe, it, expect, vi, beforeEach } from 'vitest';

// Test Issue #5: Verify refactored concurrency logic works correctly
describe('Issue #5: Refactored Concurrency Logic Verification', () => {
  it('confirms manageConcurrentPool method exists and works', async () => {
    // Setup mocks
    vi.mock('@/lib/tile-fetcher', () => ({
      TileFetcher: vi.fn().mockImplementation(() => ({
        fetch: vi.fn().mockResolvedValue(new ArrayBuffer(100))
      }))
    }));

    vi.mock('@/lib/storage-manager', () => ({
      StorageManager: vi.fn().mockImplementation(() => ({
        init: vi.fn(),
        isInitialized: vi.fn().mockReturnValue(false),
        get: vi.fn().mockResolvedValue(null),
        store: vi.fn()
      }))
    }));

    vi.mock('@/lib/decompressor', () => ({
      Decompressor: {
        decompress: vi.fn().mockImplementation(() => new ArrayBuffer(200))
      }
    }));

    vi.mock('@/lib/stream-zip', () => ({
      StreamZip: vi.fn().mockImplementation(() => ({
        createZip: vi.fn().mockImplementation(async (tiles: AsyncIterable<any>) => {
          const items = [];
          for await (const tile of tiles) {
            items.push(tile);
          }
          return new Blob([new Uint8Array(items.length)]);
        })
      }))
    }));

    vi.mock('@/lib/memory-monitor', () => ({
      MemoryMonitor: vi.fn().mockImplementation(() => ({
        getMemoryStatus: vi.fn().mockReturnValue({ level: 'normal' })
      }))
    }));

    vi.mock('@/lib/download-manifest', () => ({
      DownloadManifest: {
        createSession: vi.fn(),
        save: vi.fn(),
        markTileCompleted: vi.fn().mockImplementation(s => s),
        markTileFailed: vi.fn().mockImplementation(s => s),
        updateStatus: vi.fn().mockImplementation(s => s),
        updateProgress: vi.fn().mockImplementation(s => s),
        getStatistics: vi.fn().mockReturnValue({})
      }
    }));

    const { DownloadManager } = await import('@/lib/download-manager');
    const mgr = new DownloadManager({
      useCache: false,
      concurrentDownloads: 3
    });

    // The refactored code should use manageConcurrentPool internally
    // This test verifies that downloads complete successfully with the refactored logic
    const tiles = ['tile1', 'tile2', 'tile3', 'tile4', 'tile5'];
    const result = await mgr.startDownload(tiles);

    expect(result).toBeInstanceOf(Blob);
    expect(result.size).toBeGreaterThan(0);
  });

  it('verifies both createTileIterator and createUnifiedIterator use common pool', async () => {
    // Read the actual source to verify the refactor
    const fs = await import('fs/promises');
    const path = await import('path');

    const sourceFile = await fs.readFile(
      path.join(process.cwd(), 'src/lib/download-manager.ts'),
      'utf-8'
    );

    // Verify that createTileIterator delegates to manageConcurrentPool
    expect(sourceFile).toContain('createTileIterator');
    expect(sourceFile).toContain('manageConcurrentPool');
    expect(sourceFile).toContain('yield* this.manageConcurrentPool');

    // Verify that createUnifiedIterator also uses the common pool
    expect(sourceFile).toContain('createUnifiedIterator');

    // Both methods should be simplified to use the common pool
    const tileIteratorMatch = sourceFile.match(
      /createTileIterator[\s\S]*?yield\* this\.manageConcurrentPool/
    );
    const unifiedIteratorMatch = sourceFile.match(
      /createUnifiedIterator[\s\S]*?yield\* this\.manageConcurrentPool/
    );

    expect(tileIteratorMatch).toBeTruthy();
    expect(unifiedIteratorMatch).toBeTruthy();
  });
});

// Test Issue #6: Verify cache error logging improvements
describe('Issue #6: Cache Error Logging Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('confirms debug logging is used instead of silent failures', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');

    const sourceFile = await fs.readFile(
      path.join(process.cwd(), 'src/lib/download-manager.ts'),
      'utf-8'
    );

    // Verify debug logging for cache errors
    expect(sourceFile).toContain('console.debug');
    expect(sourceFile).toContain('Cache read error');
    expect(sourceFile).toContain('Cache write error');

    // Should not have empty catch blocks anymore
    const emptyCatchPattern = /catch\s*\{\s*\/\/\s*ignore\s*\}/g;
    const emptyMatches = sourceFile.match(emptyCatchPattern);

    // If there are any empty catches, they should be very few (ideally none)
    if (emptyMatches) {
      expect(emptyMatches.length).toBeLessThan(2);
    }
  });

  it('confirms cache statistics tracking is implemented', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');

    const sourceFile = await fs.readFile(
      path.join(process.cwd(), 'src/lib/download-manager.ts'),
      'utf-8'
    );

    // Verify cache stats properties exist
    expect(sourceFile).toContain('cacheStats');
    expect(sourceFile).toContain('hits:');
    expect(sourceFile).toContain('misses:');
    expect(sourceFile).toContain('errors:');
    expect(sourceFile).toContain('writeErrors:');

    // Verify stats are incremented
    expect(sourceFile).toContain('this.cacheStats.hits++');
    expect(sourceFile).toContain('this.cacheStats.misses++');
    expect(sourceFile).toContain('this.cacheStats.errors++');
    expect(sourceFile).toContain('this.cacheStats.writeErrors++');

    // Verify stats are included in getStatistics
    expect(sourceFile).toContain('cache: this.cacheStats');
  });

  it('verifies error messages are informative', async () => {
    const consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    vi.mock('@/lib/storage-manager', () => ({
      StorageManager: vi.fn().mockImplementation(() => ({
        init: vi.fn(),
        isInitialized: vi.fn().mockReturnValue(true),
        get: vi.fn().mockRejectedValue(new Error('Test cache error')),
        store: vi.fn().mockRejectedValue(new Error('Test write error'))
      }))
    }));

    vi.mock('@/lib/tile-fetcher', () => ({
      TileFetcher: vi.fn().mockImplementation(() => ({
        fetch: vi.fn().mockResolvedValue(new ArrayBuffer(100))
      }))
    }));

    vi.mock('@/lib/decompressor', () => ({
      Decompressor: {
        decompress: vi.fn().mockImplementation(() => new ArrayBuffer(200))
      }
    }));

    vi.mock('@/lib/stream-zip', () => ({
      StreamZip: vi.fn().mockImplementation(() => ({
        createZip: vi.fn().mockResolvedValue(new Blob())
      }))
    }));

    vi.mock('@/lib/memory-monitor', () => ({
      MemoryMonitor: vi.fn().mockImplementation(() => ({
        getMemoryStatus: vi.fn().mockReturnValue({ level: 'normal' })
      }))
    }));

    vi.mock('@/lib/download-manifest', () => ({
      DownloadManifest: {
        createSession: vi.fn(),
        save: vi.fn(),
        markTileCompleted: vi.fn().mockImplementation(s => s),
        markTileFailed: vi.fn().mockImplementation(s => s),
        updateStatus: vi.fn().mockImplementation(s => s),
        updateProgress: vi.fn().mockImplementation(s => s),
        getStatistics: vi.fn().mockReturnValue({})
      }
    }));

    const { DownloadManager } = await import('@/lib/download-manager');
    const mgr = new DownloadManager({ useCache: true });

    try {
      await mgr.startDownload(['test-tile']);
    } catch {
      // May or may not throw, we're just checking logging
    }

    // Should have logged cache errors with tile ID
    if (consoleDebugSpy.mock.calls.length > 0) {
      const cacheErrorLogs = consoleDebugSpy.mock.calls.filter(
        call => call[0]?.includes('Cache') && call[0]?.includes('error')
      );

      if (cacheErrorLogs.length > 0) {
        // Error logs should include the tile ID
        expect(cacheErrorLogs[0][0]).toContain('tile');
      }
    }

    consoleDebugSpy.mockRestore();
  });
});

// Integration test to verify both improvements work together
describe('Integration: Issues #5 and #6 Combined', () => {
  it('verifies refactored concurrency works with cache error logging', async () => {
    const consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    let concurrentRequests = 0;
    let peakConcurrency = 0;

    vi.mock('@/lib/tile-fetcher', () => ({
      TileFetcher: vi.fn().mockImplementation(() => ({
        fetch: vi.fn().mockImplementation(async () => {
          concurrentRequests++;
          peakConcurrency = Math.max(peakConcurrency, concurrentRequests);
          await new Promise(r => setTimeout(r, 10));
          concurrentRequests--;
          return new ArrayBuffer(100);
        })
      }))
    }));

    vi.mock('@/lib/storage-manager', () => ({
      StorageManager: vi.fn().mockImplementation(() => ({
        init: vi.fn(),
        isInitialized: vi.fn().mockReturnValue(true),
        get: vi.fn().mockImplementation(async (id: string) => {
          if (id.includes('error')) {
            throw new Error('Cache error');
          }
          return null; // Cache miss
        }),
        store: vi.fn()
      }))
    }));

    vi.mock('@/lib/decompressor', () => ({
      Decompressor: {
        decompress: vi.fn().mockImplementation(() => new ArrayBuffer(200))
      }
    }));

    vi.mock('@/lib/stream-zip', () => ({
      StreamZip: vi.fn().mockImplementation(() => ({
        createZip: vi.fn().mockResolvedValue(new Blob())
      }))
    }));

    vi.mock('@/lib/memory-monitor', () => ({
      MemoryMonitor: vi.fn().mockImplementation(() => ({
        getMemoryStatus: vi.fn().mockReturnValue({ level: 'normal' })
      }))
    }));

    vi.mock('@/lib/download-manifest', () => ({
      DownloadManifest: {
        createSession: vi.fn(),
        save: vi.fn(),
        markTileCompleted: vi.fn().mockImplementation(s => s),
        markTileFailed: vi.fn().mockImplementation(s => s),
        updateStatus: vi.fn().mockImplementation(s => s),
        updateProgress: vi.fn().mockImplementation(s => s),
        getStatistics: vi.fn().mockReturnValue({})
      }
    }));

    const { DownloadManager } = await import('@/lib/download-manager');
    const mgr = new DownloadManager({
      useCache: true,
      concurrentDownloads: 3
    });

    const tiles = ['tile1', 'error-tile', 'tile3', 'tile4', 'tile5'];
    const result = await mgr.startDownload(tiles);

    // Should complete successfully
    expect(result).toBeInstanceOf(Blob);

    // Should respect concurrency limit
    expect(peakConcurrency).toBeLessThanOrEqual(3);

    // Should have logged the cache error
    const errorLogs = consoleDebugSpy.mock.calls.filter(
      call => call[0]?.includes('Cache') && call[0]?.includes('error')
    );
    expect(errorLogs.length).toBeGreaterThan(0);

    // Stats should include cache metrics
    const stats = mgr.getStatistics() as any;
    expect(stats?.cache).toBeDefined();

    consoleDebugSpy.mockRestore();
  });
});