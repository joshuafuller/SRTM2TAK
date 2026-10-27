import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.mock('@/lib/tile-fetcher', () => ({
  TileFetcher: vi.fn().mockImplementation(function () { return { fetch: h.fetchMock }; })
}));

vi.mock('@/lib/storage-manager', () => ({
  StorageManager: vi.fn().mockImplementation(function () { return {
    init: vi.fn().mockResolvedValue(undefined),
    isInitialized: vi.fn().mockReturnValue(false),
    get: vi.fn().mockResolvedValue(null),
    store: vi.fn().mockResolvedValue(undefined),
  }; })
}));

vi.mock('@/lib/decompressor', () => ({
  Decompressor: { decompress: vi.fn().mockReturnValue(new ArrayBuffer(100)) }
}));

vi.mock('@/lib/stream-zip', () => ({
  StreamZip: vi.fn().mockImplementation(function () { return {
    createZip: vi.fn().mockImplementation(async (tiles: AsyncIterable<unknown>) => {
      for await (const _tile of tiles) { /* add to ZIP */ }
      return new Blob(['zip']);
    })
  }; })
}));

describe('DownloadManager failed tiles', () => {
  beforeEach(() => {
    h.fetchMock.mockReset();
  });

  it('reports a tile that failed with an error, and still saves the others', async () => {
    h.fetchMock.mockImplementation(async (tileId: string) => {
      if (tileId === 'N10E001') throw new Error('HTTP 500: Internal Server Error');
      return new ArrayBuffer(100);
    });
    const onComplete = vi.fn();
    const onTileComplete = vi.fn();
    const { DownloadManager } = await import('@/lib/download-manager');
    const mgr = new DownloadManager({ onComplete, onTileComplete, useCache: false });

    await mgr.startDownload(['N10E000', 'N10E001', 'N10E002']);

    expect(onTileComplete).toHaveBeenCalledWith('N10E001', false);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][1]).toEqual({ failedTiles: ['N10E001'] });
  });

  it('does not count ocean tiles (404) as failed', async () => {
    h.fetchMock.mockImplementation(async (tileId: string) => (tileId === 'N10E001' ? null : new ArrayBuffer(100)));
    const onComplete = vi.fn();
    const { DownloadManager } = await import('@/lib/download-manager');
    const mgr = new DownloadManager({ onComplete, useCache: false });

    await mgr.startDownload(['N10E000', 'N10E001']);

    expect(onComplete.mock.calls[0][1]).toEqual({ failedTiles: [] });
  });

  it('fails the download when every tile failed', async () => {
    h.fetchMock.mockRejectedValue(new Error('Failed to fetch'));
    const onComplete = vi.fn();
    const onError = vi.fn();
    const { DownloadManager } = await import('@/lib/download-manager');
    const mgr = new DownloadManager({ onComplete, onError, useCache: false });

    const err = await mgr.startDownload(['N10E000', 'N10E001']).catch((e) => e);

    expect(err.message).toMatch(/All 2 tiles failed/);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });
});
