import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as pako from 'pako';

const h = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  zipSizes: [] as number[],
  storage: {
    init: vi.fn(),
    isInitialized: vi.fn(),
    get: vi.fn(),
    store: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/tile-fetcher', () => ({
  TileFetcher: vi.fn().mockImplementation(function () { return { fetch: h.fetchMock }; })
}));

vi.mock('@/lib/storage-manager', () => ({
  StorageManager: vi.fn().mockImplementation(function () { return h.storage; })
}));

vi.mock('@/lib/stream-zip', () => ({
  StreamZip: vi.fn().mockImplementation(function () { return {
    createZip: vi.fn().mockImplementation(async (tiles: AsyncIterable<{ id: string; data: ArrayBuffer }>) => {
      h.zipSizes = [];
      for await (const tile of tiles) h.zipSizes.push(tile.data.byteLength);
      return new Blob(['zip']);
    })
  }; })
}));

const goodGzip = () => pako.gzip(new Uint8Array(100)).buffer;
const notGzip = () => new TextEncoder().encode('<html>captive portal</html>').buffer;

describe('DownloadManager corrupt tile data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.storage.init.mockResolvedValue(undefined);
    h.storage.isInitialized.mockReturnValue(true);
    h.storage.store.mockResolvedValue(undefined);
    h.storage.delete.mockResolvedValue(undefined);
  });

  it('deletes a corrupt cached tile and downloads it again', async () => {
    h.storage.get.mockResolvedValue({ id: 'N10E000', data: notGzip(), size: 27, timestamp: 1, compressed: true });
    h.fetchMock.mockResolvedValue(goodGzip());
    const onComplete = vi.fn();
    const { DownloadManager } = await import('@/lib/download-manager');
    const mgr = new DownloadManager({ onComplete });

    await mgr.startDownload(['N10E000']);

    expect(h.storage.delete).toHaveBeenCalledWith('N10E000');
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
    expect(h.zipSizes).toEqual([100]);
    expect(onComplete.mock.calls[0][1]).toEqual({ failedTiles: [] });
  });

  it('does not cache a downloaded tile that is not valid gzip', async () => {
    h.storage.get.mockResolvedValue(null);
    h.fetchMock.mockImplementation(async (id: string) => (id === 'N10E001' ? notGzip() : goodGzip()));
    const onComplete = vi.fn();
    const { DownloadManager } = await import('@/lib/download-manager');
    const mgr = new DownloadManager({ onComplete });

    await mgr.startDownload(['N10E000', 'N10E001']);

    const storedIds = h.storage.store.mock.calls.map((call) => call[0].id);
    expect(storedIds).toEqual(['N10E000']);
    expect(onComplete.mock.calls[0][1]).toEqual({ failedTiles: ['N10E001'] });
  });
});
