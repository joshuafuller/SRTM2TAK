import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  fetchMock: vi.fn<[], Promise<ArrayBuffer>>(),
  createZipMock: vi.fn(),
  storageFactory: () => ({
    init: vi.fn().mockResolvedValue(undefined),
    isInitialized: vi.fn().mockReturnValue(false),
    get: vi.fn().mockResolvedValue(null),
    store: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@/lib/tile-fetcher', () => ({
  TileFetcher: vi.fn().mockImplementation(() => ({ fetch: h.fetchMock }))
}));

vi.mock('@/lib/stream-zip', () => ({
  StreamZip: vi.fn().mockImplementation(() => ({ createZip: (...args:any[]) => h.createZipMock(...args) }))
}));

vi.mock('@/lib/storage-manager', () => ({
  StorageManager: vi.fn().mockImplementation(() => h.storageFactory())
}));

vi.mock('@/lib/decompressor', () => ({
  Decompressor: { decompress: vi.fn().mockImplementation((_buf: ArrayBuffer) => new ArrayBuffer(100)) }
}));

describe('DownloadManager callbacks over many tiles', () => {
  it('invokes onTileComplete for every tile and onComplete once', async () => {
    const N = 28;
    const tiles = Array.from({ length: N }, (_, i) => `N22E${String(100 + i).padStart(3, '0')}`);

    // Mock fetcher to resolve all tiles
    h.fetchMock.mockImplementation(async () => new ArrayBuffer(100));
    vi.mock('@/lib/tile-fetcher', () => ({
      TileFetcher: vi.fn().mockImplementation(() => ({
        fetch: vi.fn().mockImplementation(async () => {
          await new Promise((r) => setTimeout(r, Math.random() * 3));
          return new ArrayBuffer(100);
        })
      }))
    }));

    // Disable cache
    h.storageFactory = () => ({
      init: vi.fn().mockResolvedValue(undefined),
      isInitialized: vi.fn().mockReturnValue(false),
      get: vi.fn().mockResolvedValue(null),
      store: vi.fn().mockResolvedValue(undefined),
    });

    // Fake zip: just consume all tiles and return blob
    h.createZipMock.mockImplementation(async (iter: AsyncIterable<{ id:string; data:ArrayBuffer }>) => {
      let count = 0;
      for await (const _ of iter) count++;
      expect(count).toBe(N);
      return new Blob([new Uint8Array([7,7,7])], { type: 'application/zip' });
    });

    const onTileComplete = vi.fn();
    const onComplete = vi.fn();
    const { DownloadManager } = await import('@/lib/download-manager');
    const mgr = new DownloadManager({ onTileComplete, onComplete, concurrentDownloads: 4, useCache: false });

    await mgr.startDownload(tiles);

    // 28 tiles should all call onTileComplete(true)
    expect(onTileComplete).toHaveBeenCalledTimes(N);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
