import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('DownloadManager concurrency', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('respects the concurrentDownloads cap', async () => {
    // Use a shared state object to track concurrency
    const state = { active: 0, peak: 0 };

    // Mock TileFetcher with delays and tracking of active requests
    vi.mock('@/lib/tile-fetcher', () => ({
      TileFetcher: vi.fn().mockImplementation(() => ({
        fetch: vi.fn().mockImplementation(async () => {
          state.active++;
          state.peak = Math.max(state.peak, state.active);
          // Simulate network time
          await new Promise((r) => setTimeout(r, 10));
          state.active--;
          return new ArrayBuffer(500_000);
        })
      }))
    }));

    // Mock Storage to bypass cache
    vi.mock('@/lib/storage-manager', () => ({
      StorageManager: vi.fn().mockImplementation(() => ({
        init: vi.fn().mockResolvedValue(undefined),
        isInitialized: vi.fn().mockReturnValue(false),
        get: vi.fn().mockResolvedValue(null),
        store: vi.fn().mockResolvedValue(undefined),
      }))
    }));

    // Mock Decompressor to be quick
    vi.mock('@/lib/decompressor', () => ({
      Decompressor: { decompress: vi.fn().mockImplementation(() => new ArrayBuffer(10)) }
    }));

    const { DownloadManager } = await import('@/lib/download-manager');
    const mgr = new DownloadManager({ useCache: false, concurrentDownloads: 3 });
    const tiles = Array.from({ length: 10 }, (_, i) => `N10E0${i}`);
    const p = mgr.startDownload(tiles);

    await vi.runAllTimersAsync();
    await p;

    expect(state.peak).toBeLessThanOrEqual(3);
  });
});
