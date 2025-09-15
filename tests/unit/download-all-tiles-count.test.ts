import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => {
  return {
    fetchMock: vi.fn(() => Promise.resolve(new ArrayBuffer(0))),
    createZipMock: vi.fn(),
    storageFactory: () => ({
      init: vi.fn().mockResolvedValue(undefined),
      isInitialized: vi.fn().mockReturnValue(false),
      get: vi.fn().mockResolvedValue(null),
      store: vi.fn().mockResolvedValue(undefined),
    }),
  };
});

vi.mock('@/lib/tile-fetcher', () => ({
  TileFetcher: vi.fn().mockImplementation(() => ({ fetch: h.fetchMock }))
}));

vi.mock('@/lib/stream-zip', () => ({
  StreamZip: vi.fn().mockImplementation(() => ({ createZip: (...args: any[]) => h.createZipMock(...args) }))
}));

vi.mock('@/lib/storage-manager', () => ({
  StorageManager: vi.fn().mockImplementation(() => h.storageFactory())
}));

vi.mock('@/lib/decompressor', () => ({
  Decompressor: { decompress: vi.fn().mockImplementation((_buf: ArrayBuffer) => new ArrayBuffer(100)) }
}));

// Utility to consume the async iterable and count entries
async function countTiles<T extends { id: string; data: ArrayBuffer }>(it: AsyncIterable<T>): Promise<number> {
  let n = 0;
  for await (const _ of it) n++;
  return n;
}

describe('DownloadManager yields all requested tiles to ZIP', () => {
  beforeEach(() => {
    vi.resetModules();
    h.fetchMock.mockReset();
    h.createZipMock.mockReset();
    // default: no cache
    h.storageFactory = () => ({
      init: vi.fn().mockResolvedValue(undefined),
      isInitialized: vi.fn().mockReturnValue(false),
      get: vi.fn().mockResolvedValue(null),
      store: vi.fn().mockResolvedValue(undefined),
    });
  });
  it('passes all non-ocean tiles (28) to StreamZip', async () => {
    const tileIds = Array.from({ length: 28 }, (_, i) => `N20E${String(10 + i).padStart(3, '0')}`);

    // Mock fetcher to return data for all
    h.fetchMock.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, Math.random() * 5));
      return new ArrayBuffer(500_000);
    });


    // Capture tiles passed to StreamZip
    h.createZipMock.mockImplementation(async (tiles: AsyncIterable<{ id: string; data: ArrayBuffer }>) => {
      const n = await countTiles(tiles);
      expect(n).toBe(28);
      return new Blob([new Uint8Array([1,2,3])], { type: 'application/zip' });
    });

    const { DownloadManager } = await import('@/lib/download-manager');
    const mgr = new DownloadManager({ concurrentDownloads: 4, useCache: false });
    const blob = await mgr.startDownload(tileIds);
    expect(blob).toBeInstanceOf(Blob);
    expect(h.createZipMock).toHaveBeenCalledTimes(1);
  });

  it('uses cache for some tiles but still passes all to ZIP', async () => {
    const tileIds = Array.from({ length: 10 }, (_, i) => `N10E${String(10 + i).padStart(3, '0')}`);

    // Fetcher only for non-cached
    h.fetchMock.mockResolvedValue(new ArrayBuffer(500_000));

    // Cache hits for first 6 tiles
    const cachedSet = new Set(tileIds.slice(0, 6));
    h.storageFactory = () => ({
      init: vi.fn().mockResolvedValue(undefined),
      isInitialized: vi.fn().mockReturnValue(true),
      get: vi.fn().mockImplementation(async (id: string) => {
        if (cachedSet.has(id)) return { id, data: new ArrayBuffer(100), size: 100, timestamp: Date.now(), compressed: true };
        return null;
      }),
      store: vi.fn().mockResolvedValue(undefined),
    });

    h.createZipMock.mockImplementation(async (tiles: AsyncIterable<{ id: string; data: ArrayBuffer }>) => {
      const yielded: string[] = [];
      for await (const t of tiles) yielded.push(t.id);
      // Debug output
      // eslint-disable-next-line no-console
      console.log('Yielded IDs:', yielded.join(','));
      expect(yielded.length).toBe(10);
      // Optional: ensure all tileIds are present
      for (const id of tileIds) expect(yielded).toContain(id);
      return new Blob([new Uint8Array([4,5,6])], { type: 'application/zip' });
    });

    const { DownloadManager } = await import('@/lib/download-manager');
    const mgr = new DownloadManager({ useCache: true, concurrentDownloads: 3 });
    await mgr.startDownload(tileIds);
    // Should only fetch 4 over network
    expect(h.fetchMock).toHaveBeenCalledTimes(4);
  });
});
