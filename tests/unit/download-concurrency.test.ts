import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist the state object and mocks
const h = vi.hoisted(() => {
  const state = { active: 0, peak: 0 };
  return {
    state,
    fetchMock: vi.fn().mockImplementation(async () => {
      state.active++;
      state.peak = Math.max(state.peak, state.active);
      // Simulate network time
      await new Promise((r) => setTimeout(r, 10));
      state.active--;
      return new ArrayBuffer(500_000);
    })
  };
});

// Apply mocks at module level
vi.mock('@/lib/tile-fetcher', () => ({
  TileFetcher: vi.fn().mockImplementation(() => ({
    fetch: h.fetchMock
  }))
}));

vi.mock('@/lib/storage-manager', () => ({
  StorageManager: vi.fn().mockImplementation(() => ({
    init: vi.fn().mockResolvedValue(undefined),
    isInitialized: vi.fn().mockReturnValue(false),
    get: vi.fn().mockResolvedValue(null),
    store: vi.fn().mockResolvedValue(undefined),
  }))
}));

vi.mock('@/lib/decompressor', () => ({
  Decompressor: { decompress: vi.fn().mockImplementation(() => new ArrayBuffer(10)) }
}));

vi.mock('@/lib/stream-zip', () => ({
  StreamZip: vi.fn().mockImplementation(() => ({
    createZip: vi.fn().mockImplementation(async (tiles: AsyncIterable<any>) => {
      // Consume the async iterable
      for await (const _ of tiles) {
        // Process tile
      }
      return new Blob([new Uint8Array([1, 2, 3])], { type: 'application/zip' });
    })
  }))
}));

describe('DownloadManager concurrency', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset state for each test
    h.state.active = 0;
    h.state.peak = 0;
  });

  it('respects the concurrentDownloads cap', async () => {
    const { DownloadManager } = await import('@/lib/download-manager');
    const mgr = new DownloadManager({ useCache: false, concurrentDownloads: 3 });
    const tiles = Array.from({ length: 10 }, (_, i) => `N10E0${i}`);
    const p = mgr.startDownload(tiles);

    await vi.runAllTimersAsync();
    await p;

    expect(h.state.peak).toBeLessThanOrEqual(3);
  });
});
