import { describe, it, expect, vi } from 'vitest';
import { DownloadManager } from '@/lib/download-manager';

describe('DownloadManager.getCachedTiles', () => {
  it('returns a set of cached tile IDs', async () => {
    // Mock StorageManager to simulate cache hits for two tiles
    vi.mock('@/lib/storage-manager', () => ({
      StorageManager: vi.fn().mockImplementation(() => ({
        init: vi.fn().mockResolvedValue(undefined),
        isInitialized: vi.fn().mockReturnValue(true),
        get: vi.fn().mockImplementation(async (id: string) => {
          if (id === 'N10E010' || id === 'N10E011') {
            return { id, data: new ArrayBuffer(10), size: 10, timestamp: Date.now(), compressed: true };
          }
          return null;
        }),
      }))
    }));

    const mgr = new DownloadManager({ useCache: true });
    const result = await mgr.getCachedTiles(['N10E010', 'N10E011', 'N10E012']);
    expect(result.has('N10E010')).toBe(true);
    expect(result.has('N10E011')).toBe(true);
    expect(result.has('N10E012')).toBe(false);
  });
});

