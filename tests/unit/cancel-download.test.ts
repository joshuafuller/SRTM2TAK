import { describe, it, expect, vi, beforeEach } from 'vitest';

// Fetch that waits until the test releases it, and rejects on abort like real fetch
const fetchCalls: string[] = [];
let releaseFetch: (() => void) | null = null;

vi.mock('@/lib/tile-fetcher', () => ({
  TileFetcher: vi.fn().mockImplementation(function () { return {
    fetch: vi.fn().mockImplementation(async (tileId: string, signal?: AbortSignal) => {
      fetchCalls.push(tileId);
      await new Promise<void>((resolve, reject) => {
        releaseFetch = resolve;
        if (signal?.aborted) reject(new DOMException('The operation was aborted', 'AbortError'));
        signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted', 'AbortError'));
        }, { once: true });
      });
      return new ArrayBuffer(1024);
    })
  }; })
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
  Decompressor: { decompress: vi.fn().mockReturnValue(new ArrayBuffer(10)) }
}));

// Consume the tile iterator like the real ZIP writer does
vi.mock('@/lib/stream-zip', () => ({
  StreamZip: vi.fn().mockImplementation(function () { return {
    createZip: vi.fn().mockImplementation(async (tiles: AsyncIterable<unknown>) => {
      for await (const _tile of tiles) { /* add to ZIP */ }
      return new Blob(['zip']);
    })
  }; })
}));

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('DownloadManager cancellation', () => {
  beforeEach(() => {
    fetchCalls.length = 0;
    releaseFetch = null;
  });

  it('stops queued tiles, rejects with AbortError, and never calls onComplete', async () => {
    const onComplete = vi.fn();
    const onError = vi.fn();
    const { DownloadManager } = await import('@/lib/download-manager');
    const mgr = new DownloadManager({ onComplete, onError, concurrentDownloads: 1, useCache: false });
    const tiles = ['N10E000', 'N10E001', 'N10E002', 'N10E003', 'N10E004'];

    const promise = mgr.startDownload(tiles);
    const settled = promise.then(() => 'resolved', (err) => err);
    while (fetchCalls.length === 0) await tick();

    mgr.cancelDownload();
    const result = await settled;

    expect((result as Error).name).toBe('AbortError');
    expect(fetchCalls).toEqual(['N10E000']);
    expect(onComplete).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('stops a fetch that has finished but not yet been added to the ZIP', async () => {
    const onComplete = vi.fn();
    const { DownloadManager } = await import('@/lib/download-manager');
    const mgr = new DownloadManager({ onComplete, concurrentDownloads: 1, useCache: false });

    const settled = mgr.startDownload(['N10E000', 'N10E001']).then(() => 'resolved', (err) => err);
    while (!releaseFetch) await tick();

    // The first tile finishes at the same moment the user cancels
    releaseFetch();
    mgr.cancelDownload();
    const result = await settled;

    expect((result as Error).name).toBe('AbortError');
    expect(fetchCalls).toEqual(['N10E000']);
    expect(onComplete).not.toHaveBeenCalled();
  });
});

describe('DownloadManager cancel before the pool starts', () => {
  beforeEach(() => {
    fetchCalls.length = 0;
  });

  async function settleWithin(promise: Promise<unknown>, ms: number): Promise<unknown> {
    return Promise.race([promise.then(() => 'resolved', (err) => err), new Promise((r) => setTimeout(() => r('timeout'), ms))]);
  }

  it('rejects when cancelled during the cache scan (pool must not spin)', async () => {
    const { DownloadManager } = await import('@/lib/download-manager');
    const mgr = new DownloadManager({ concurrentDownloads: 2, useCache: true });
    (mgr as any).storage.isInitialized = () => true;
    // The user cancels while the cache scan runs
    mgr.getCachedTiles = async () => {
      mgr.cancelDownload();
      return new Set<string>();
    };

    const result = await settleWithin(mgr.startDownload(['N10E000', 'N10E001', 'N10E002']), 2000);
    expect((result as Error).name).toBe('AbortError');
    expect(fetchCalls).toEqual([]);
  });

  it('rejects when cancelled while storage is starting', async () => {
    const { DownloadManager } = await import('@/lib/download-manager');
    const mgr = new DownloadManager({ concurrentDownloads: 2, useCache: false });

    const promise = mgr.startDownload(['N10E000', 'N10E001']);
    mgr.cancelDownload(); // before the first await in startDownload finishes

    const result = await settleWithin(promise, 2000);
    expect((result as Error).name).toBe('AbortError');
    expect(fetchCalls).toEqual([]);
  });
});
