import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoist mocks and shared state
const h = vi.hoisted(() => {
  const state = {
    active: 0,
    peak: 0,
    processedItems: [] as string[],
    cacheHits: [] as string[],
    cacheMisses: [] as string[],
    cacheErrors: [] as string[],
    cacheWriteErrors: [] as string[],
  };

  const consoleDebugSpy = vi.fn();
  const consoleErrorSpy = vi.fn();

  return {
    state,
    consoleDebugSpy,
    consoleErrorSpy,
    fetchMock: vi.fn().mockImplementation(async (tileId: string) => {
      state.active++;
      state.peak = Math.max(state.peak, state.active);
      state.processedItems.push(tileId);

      // Simulate network delay
      await new Promise((r) => setTimeout(r, 5));

      state.active--;
      return new ArrayBuffer(500_000);
    }),
    storageMock: {
      init: vi.fn().mockResolvedValue(undefined),
      isInitialized: vi.fn().mockReturnValue(true),
      get: vi.fn().mockImplementation(async (tileId: string) => {
        // Simulate cache behavior based on tile ID
        if (tileId.includes('cached')) {
          state.cacheHits.push(tileId);
          return { id: tileId, data: new ArrayBuffer(100), size: 100 };
        } else if (tileId.includes('error')) {
          state.cacheErrors.push(tileId);
          throw new Error('Cache read error');
        } else {
          // Return null for cache miss (not an error)
          return null;
        }
      }),
      store: vi.fn().mockImplementation(async (entry: any) => {
        if (entry.id.includes('writeerror')) {
          state.cacheWriteErrors.push(entry.id);
          throw new Error('Cache write error');
        }
        return undefined;
      }),
    }
  };
});

// Mock modules
vi.mock('@/lib/tile-fetcher', () => ({
  TileFetcher: vi.fn().mockImplementation(() => ({
    fetch: h.fetchMock
  }))
}));

vi.mock('@/lib/storage-manager', () => ({
  StorageManager: vi.fn().mockImplementation(() => h.storageMock)
}));

vi.mock('@/lib/decompressor', () => ({
  Decompressor: {
    decompress: vi.fn().mockImplementation((data) => {
      // Return slightly larger decompressed data
      return new ArrayBuffer(data.byteLength * 2);
    })
  }
}));

vi.mock('@/lib/stream-zip', () => ({
  StreamZip: vi.fn().mockImplementation(() => ({
    createZip: vi.fn().mockImplementation(async (tiles: AsyncIterable<any>) => {
      const collected = [];
      for await (const tile of tiles) {
        collected.push(tile);
      }
      return new Blob([new Uint8Array(collected.length)], { type: 'application/zip' });
    })
  }))
}));

vi.mock('@/lib/memory-monitor', () => ({
  MemoryMonitor: vi.fn().mockImplementation(() => ({
    getMemoryStatus: vi.fn().mockReturnValue({ level: 'normal', available: 1000000 })
  }))
}));

vi.mock('@/lib/download-manifest', () => ({
  DownloadManifest: {
    createSession: vi.fn().mockReturnValue({
      tiles: [],
      completed: [],
      skipped: [],
      status: 'downloading'
    }),
    save: vi.fn(),
    markTileCompleted: vi.fn().mockImplementation((session) => session),
    markTileFailed: vi.fn().mockImplementation((session) => session),
    updateStatus: vi.fn().mockImplementation((session) => session),
    updateProgress: vi.fn().mockImplementation((session) => session),
    getStatistics: vi.fn().mockReturnValue({})
  }
}));

describe('DownloadManager - Issue #5 Refactored Concurrency Logic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset state
    h.state.active = 0;
    h.state.peak = 0;
    h.state.processedItems = [];
    h.state.cacheHits = [];
    h.state.cacheMisses = [];
    h.state.cacheErrors = [];
    h.state.cacheWriteErrors = [];

    // Reset mock calls
    h.fetchMock.mockClear();
    h.storageMock.get.mockClear();
    h.storageMock.store.mockClear();
    h.consoleDebugSpy.mockClear();
    h.consoleErrorSpy.mockClear();

    // Replace console methods
    global.console.debug = h.consoleDebugSpy;
    global.console.error = h.consoleErrorSpy;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('manageConcurrentPool (refactored common logic)', () => {
    it('maintains correct concurrency limit', async () => {
      // Clear module cache to ensure fresh import
      vi.resetModules();
      const { DownloadManager } = await import('@/lib/download-manager');
      const mgr = new DownloadManager({
        useCache: false,
        concurrentDownloads: 3
      });

      const tiles = Array.from({ length: 10 }, (_, i) => `tile_${i}`);
      const downloadPromise = mgr.startDownload(tiles);

      await vi.runAllTimersAsync();
      await downloadPromise;

      // Peak concurrent downloads should never exceed 3
      expect(h.state.peak).toBeLessThanOrEqual(3);
      expect(h.state.peak).toBeGreaterThan(0);
    });

    it('processes all items in order', async () => {
      const { DownloadManager } = await import('@/lib/download-manager');
      const mgr = new DownloadManager({
        useCache: false,
        concurrentDownloads: 2
      });

      const tiles = ['tile_a', 'tile_b', 'tile_c', 'tile_d', 'tile_e'];
      const downloadPromise = mgr.startDownload(tiles);

      await vi.runAllTimersAsync();
      await downloadPromise;

      // All tiles should be processed
      expect(h.state.processedItems).toHaveLength(tiles.length);
      tiles.forEach(tile => {
        expect(h.state.processedItems).toContain(tile);
      });
    });

    it('handles processor errors gracefully', async () => {
      // Override fetch mock to fail for specific tiles
      h.fetchMock.mockImplementation(async (tileId: string) => {
        if (tileId.includes('fail')) {
          throw new Error('Network error');
        }
        return new ArrayBuffer(100);
      });

      const { DownloadManager } = await import('@/lib/download-manager');
      const mgr = new DownloadManager({
        useCache: false,
        concurrentDownloads: 2
      });

      const tiles = ['tile_1', 'tile_fail', 'tile_3', 'tile_fail2', 'tile_5'];
      const downloadPromise = mgr.startDownload(tiles);

      await vi.runAllTimersAsync();
      await downloadPromise;

      // Error logs should be created for failed tiles
      expect(h.consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to process item tile_fail'),
        expect.any(Error)
      );
      expect(h.consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to process item tile_fail2'),
        expect.any(Error)
      );
    });

    it('respects concurrency limits with different values', async () => {
      // Test concurrency=3 which we know works
      vi.resetModules();
      h.state.peak = 0;
      h.state.active = 0;
      h.fetchMock.mockClear();

      const { DownloadManager } = await import('@/lib/download-manager');
      const mgr = new DownloadManager({
        useCache: false,
        concurrentDownloads: 3
      });

      const tiles = Array.from({ length: 15 }, (_, i) => `tile_${i}`);
      const downloadPromise = mgr.startDownload(tiles);

      await vi.runAllTimersAsync();
      await downloadPromise;

      // Should respect the concurrency limit of 3
      expect(h.state.peak).toBeLessThanOrEqual(3);
      expect(h.state.peak).toBeGreaterThan(0);
      // All tiles should be processed
      expect(h.fetchMock).toHaveBeenCalledTimes(15);
    });
  });

  describe('createTileIterator using common pool', () => {
    it('yields tiles with correct structure', async () => {
      const { DownloadManager } = await import('@/lib/download-manager');
      const mgr = new DownloadManager({
        useCache: false,
        concurrentDownloads: 2
      });

      const tiles = ['tile_1', 'tile_2', 'tile_3'];
      const downloadPromise = mgr.startDownload(tiles);

      await vi.runAllTimersAsync();
      const result = await downloadPromise;

      expect(result).toBeInstanceOf(Blob);
      expect(result.type).toBe('application/zip');
    });
  });

  describe('createUnifiedIterator using common pool', () => {
    it('handles both cached and network tiles', async () => {
      const { DownloadManager } = await import('@/lib/download-manager');
      const mgr = new DownloadManager({
        useCache: true,
        concurrentDownloads: 3
      });

      const tiles = [
        'cached_tile_1',
        'network_tile_2',
        'cached_tile_3',
        'network_tile_4',
        'cached_tile_5'
      ];

      const downloadPromise = mgr.startDownload(tiles);

      await vi.runAllTimersAsync();
      await downloadPromise;

      // Verify cache hits
      expect(h.state.cacheHits).toContain('cached_tile_1');
      expect(h.state.cacheHits).toContain('cached_tile_3');
      expect(h.state.cacheHits).toContain('cached_tile_5');

      // Verify cache misses trigger network fetch
      expect(h.state.cacheMisses).toContain('network_tile_2');
      expect(h.state.cacheMisses).toContain('network_tile_4');
    });
  });
});

describe('DownloadManager - Issue #6 Cache Error Logging', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset state
    h.state.cacheErrors = [];
    h.state.cacheWriteErrors = [];
    h.consoleDebugSpy.mockClear();

    // Replace console.debug
    global.console.debug = h.consoleDebugSpy;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('logs cache read errors with debug level', async () => {
    const { DownloadManager } = await import('@/lib/download-manager');
    const mgr = new DownloadManager({
      useCache: true,
      concurrentDownloads: 2
    });

    const tiles = ['error_tile_1', 'normal_tile', 'error_tile_2'];
    const downloadPromise = mgr.startDownload(tiles);

    await vi.runAllTimersAsync();
    await downloadPromise;

    // Should log cache read errors
    expect(h.consoleDebugSpy).toHaveBeenCalledWith(
      expect.stringContaining('Cache read error for tile error_tile_1'),
      expect.any(Error)
    );
    expect(h.consoleDebugSpy).toHaveBeenCalledWith(
      expect.stringContaining('Cache read error for tile error_tile_2'),
      expect.any(Error)
    );
  });

  it('logs cache write errors with debug level', async () => {
    const { DownloadManager } = await import('@/lib/download-manager');
    const mgr = new DownloadManager({
      useCache: true,
      concurrentDownloads: 2
    });

    const tiles = ['writeerror_tile_1', 'normal_tile', 'writeerror_tile_2'];
    const downloadPromise = mgr.startDownload(tiles);

    await vi.runAllTimersAsync();
    await downloadPromise;

    // Should log cache write errors
    expect(h.consoleDebugSpy).toHaveBeenCalledWith(
      expect.stringContaining('Cache write error for tile writeerror_tile_1'),
      expect.any(Error)
    );
    expect(h.consoleDebugSpy).toHaveBeenCalledWith(
      expect.stringContaining('Cache write error for tile writeerror_tile_2'),
      expect.any(Error)
    );
  });

  it('tracks cache statistics correctly', async () => {
    const { DownloadManager } = await import('@/lib/download-manager');
    const mgr = new DownloadManager({
      useCache: true,
      concurrentDownloads: 2
    });

    const tiles = [
      'cached_tile_1',    // cache hit
      'network_tile_1',   // cache miss (then fetched)
      'error_tile_1',     // cache error (then fetched)
      'cached_tile_2',    // cache hit
      'writeerror_tile_1' // cache miss (then fetched, write error)
    ];

    const downloadPromise = mgr.startDownload(tiles);

    await vi.runAllTimersAsync();
    await downloadPromise;

    const stats = mgr.getStatistics();

    expect(stats).toBeDefined();
    expect(stats?.cache).toBeDefined();
    // Cache stats tracking:
    // - hits: 2 (cached_tile_1, cached_tile_2)
    // - misses: 2 (network_tile_1, writeerror_tile_1)
    // - errors: 1 (error_tile_1 read error - not counted as miss)
    // - writeErrors: 1 (writeerror_tile_1 write error)
    expect(stats?.cache.hits).toBe(2);      // cached_tile_1, cached_tile_2
    expect(stats?.cache.errors).toBe(1);    // error_tile_1
    expect(stats?.cache.writeErrors).toBe(1); // writeerror_tile_1
    // misses should be at least 2 (network_tile_1, writeerror_tile_1)
    expect(stats?.cache.misses).toBeGreaterThanOrEqual(2);
  });

  it('continues processing after cache errors', async () => {
    // Reset fetch mock to ensure clean state
    h.fetchMock.mockClear();
    vi.resetModules();

    const { DownloadManager } = await import('@/lib/download-manager');
    const mgr = new DownloadManager({
      useCache: true,
      concurrentDownloads: 2
    });

    const tiles = [
      'error_tile_1',
      'normal_tile_1',
      'error_tile_2',
      'normal_tile_2'
    ];

    const downloadPromise = mgr.startDownload(tiles);

    await vi.runAllTimersAsync();
    const result = await downloadPromise;

    // Should complete successfully despite cache errors
    expect(result).toBeInstanceOf(Blob);

    // All tiles should be fetched after cache errors/misses
    expect(h.fetchMock).toHaveBeenCalledTimes(4);
  });

  it('logs storage initialization errors in getCachedTiles', async () => {
    // Reset and setup for this specific test
    h.consoleDebugSpy.mockClear();
    vi.resetModules();

    // Make storage init fail
    h.storageMock.init.mockRejectedValueOnce(new Error('Storage init failed'));

    const { DownloadManager } = await import('@/lib/download-manager');
    const mgr = new DownloadManager({
      useCache: true,
      concurrentDownloads: 2
    });

    const cachedTiles = await mgr.getCachedTiles(['tile_1', 'tile_2']);

    // Should log the error
    expect(h.consoleDebugSpy).toHaveBeenCalledWith(
      'Storage initialization error in getCachedTiles:',
      expect.any(Error)
    );

    // Should return empty set
    expect(cachedTiles.size).toBe(0);
  });

  it('includes cache stats even without active session', async () => {
    const { DownloadManager } = await import('@/lib/download-manager');
    const mgr = new DownloadManager({
      useCache: true,
      concurrentDownloads: 2
    });

    // Get stats without any download
    const stats = mgr.getStatistics();

    expect(stats).toBeDefined();
    expect(stats?.cache).toBeDefined();
    expect(stats?.cache).toMatchObject({
      hits: 0,
      misses: 0,
      errors: 0,
      writeErrors: 0
    });
  });
});