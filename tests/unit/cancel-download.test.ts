import { describe, it, expect, vi } from 'vitest';

describe('DownloadManager cancellation', () => {
  it('aborts in-flight downloads and prevents completion callback', async () => {
    // Mock TileFetcher to take time
    vi.mock('@/lib/tile-fetcher', () => ({
      TileFetcher: vi.fn().mockImplementation(() => ({
        fetch: vi.fn().mockImplementation(async (_tileId: string, signal?: AbortSignal) => {
          // Wait until aborted or timeout
          await new Promise<void>((resolve, reject) => {
            const t = setTimeout(() => resolve(), 50);
            if (signal) {
              signal.addEventListener('abort', () => {
                clearTimeout(t);
                const err: any = new Error('Download cancelled');
                err.name = 'AbortError';
                reject(err);
              }, { once: true });
            }
          });
          return new ArrayBuffer(1024);
        })
      }))
    }));

    // Mock StorageManager to bypass DB
    vi.mock('@/lib/storage-manager', () => ({
      StorageManager: vi.fn().mockImplementation(() => ({
        init: vi.fn().mockResolvedValue(undefined),
        isInitialized: vi.fn().mockReturnValue(false),
        get: vi.fn().mockResolvedValue(null),
        store: vi.fn().mockResolvedValue(undefined),
      }))
    }));

    // Mock Decompressor
    vi.mock('@/lib/decompressor', () => ({
      Decompressor: { decompress: vi.fn().mockResolvedValue(new ArrayBuffer(10)) }
    }));

    const onComplete = vi.fn();
    const onError = vi.fn();
    const { DownloadManager } = await import('@/lib/download-manager');
    const mgr = new DownloadManager({ onComplete, onError, concurrentDownloads: 3, useCache: false });
    const tiles = Array.from({ length: 5 }, (_, i) => `N10E0${i}`);

    const promise = mgr.startDownload(tiles);
    // Cancel quickly
    mgr.cancelDownload();

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(onComplete).not.toHaveBeenCalled();
    // We suppress onError for cancels
    expect(onError).not.toHaveBeenCalled();
  });
});
