import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DownloadManager } from '@/lib/download-manager';

// Mock TileFetcher to emit network progress and return buffers
vi.mock('@/lib/tile-fetcher', () => {
  return {
    TileFetcher: vi.fn().mockImplementation((opts: any) => {
      return {
        fetch: vi.fn().mockImplementation(async (tileId: string) => {
          const total = 1_000_000; // 1MB compressed
          // Emit progress in chunks
          let loaded = 0;
          const step = 100_000;
          while (loaded < total) {
            loaded = Math.min(total, loaded + step);
            opts?.onProgress?.({ tileId, loaded, total, percent: Math.round((loaded / total) * 100) });
            // tiny delay to simulate time passing
             
            await new Promise((r) => setTimeout(r, 1));
          }
          return new ArrayBuffer(total);
        })
      };
    })
  };
});

// Mock StorageManager to disable cache effects
vi.mock('@/lib/storage-manager', () => ({
  StorageManager: vi.fn().mockImplementation(() => ({
    init: vi.fn().mockResolvedValue(undefined),
    isInitialized: vi.fn().mockReturnValue(false),
    get: vi.fn().mockResolvedValue(null),
    store: vi.fn().mockResolvedValue(undefined),
  }))
}));

// Mock Decompressor to produce SRTM-sized buffer
vi.mock('@/lib/decompressor', () => ({
  Decompressor: {
    decompress: vi.fn().mockImplementation((_data: ArrayBuffer) => {
      return new ArrayBuffer(25_934_402);
    })
  }
}));

describe('DownloadManager progress accounting', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('tracks bytes from network progress without double counting and keeps percent <= 100', async () => {
    const progressEvents: any[] = [];

    const mgr = new DownloadManager({
      useCache: false,
      onProgress: (p) => progressEvents.push({ ...p }),
    });

    const tiles = ['N10E010', 'N10E011'];
    const promise = mgr.startDownload(tiles);

    // Allow mocked progress timers to advance
    await vi.runAllTimersAsync();
    const blob = await promise;

    expect(blob).toBeInstanceOf(Blob);
    expect(progressEvents.length).toBeGreaterThan(0);

    // Percent never exceeds 100 and never NaN
    for (const ev of progressEvents) {
      expect(Number.isNaN(ev.percent)).toBe(false);
      expect(ev.percent).toBeGreaterThanOrEqual(0);
      expect(ev.percent).toBeLessThanOrEqual(100);
    }

    // Final event should be close to 100%
    const last = progressEvents[progressEvents.length - 1];
    expect(last.percent).toBeGreaterThanOrEqual(99);

    // bytesDownloaded should be at least sum of two compressed sizes (approx via events)
    const maxBytes = Math.max(...progressEvents.map((e) => e.bytesDownloaded));
    expect(maxBytes).toBeGreaterThanOrEqual(2_000_000);
  });
});

