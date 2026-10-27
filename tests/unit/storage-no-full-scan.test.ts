import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StorageManager, type CachedTile } from '@/lib/storage-manager';
import { deleteDatabase } from '../utils/indexeddb-helper';

const MB = 1024 * 1024;

function tile(id: string, size: number, time: number): CachedTile {
  return { id, data: new ArrayBuffer(size), size, timestamp: time, compressed: true };
}

// Uses the app's own database schema (StorageManager opens 'srtm2tak' itself)
describe('StorageManager without full cache scans', () => {
  let sm: StorageManager;

  beforeEach(async () => {
    await deleteDatabase('srtm2tak');
    sm = new StorageManager();
    await sm.init();
    sm.setQuotaInfo({ usage: 0, quota: Infinity });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Close the connection, or the next deleteDatabase() is blocked
    (sm as unknown as { db: { close(): void } }).db.close();
  });

  it('store() does not load every cached tile', async () => {
    await sm.store(tile('N10E000', MB, 1));
    const getAll = vi.spyOn(sm, 'getAllTiles');

    await sm.store(tile('N10E001', MB, 2));

    expect(getAll).not.toHaveBeenCalled();
  });

  it('evicts the least recently used tiles when the cache is full', async () => {
    sm.setMaxCacheSize(3 * MB);
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1_000);
    await sm.store(tile('N10E000', MB, 1));
    now.mockReturnValue(2_000);
    await sm.store(tile('N10E001', MB, 2));
    now.mockReturnValue(3_000);
    await sm.store(tile('N10E002', MB, 3));

    now.mockReturnValue(4_000);
    await sm.store(tile('N10E003', MB, 4));

    expect((await sm.getTileIds()).sort()).toEqual(['N10E001', 'N10E002', 'N10E003']);
  });

  it('getStorageInfo() counts tiles and bytes without loading them', async () => {
    await sm.store(tile('N10E000', MB, 1));
    await sm.store(tile('N10E001', 2 * MB, 2));
    const getAll = vi.spyOn(sm, 'getAllTiles');

    const info = await sm.getStorageInfo();

    expect(getAll).not.toHaveBeenCalled();
    expect(info.tileCount).toBe(2);
    expect(info.totalSize).toBe(3 * MB);
    expect(info.oldestTile?.id).toBe('N10E000');
    expect(info.newestTile?.id).toBe('N10E001');
  });

  it('get() does not write the tile back on every read', async () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1_000);
    await sm.store(tile('N10E000', MB, 1));

    now.mockReturnValue(2_000);
    await sm.get('N10E000');

    // Read again: lastAccessed is still from the store, so no write happened
    now.mockReturnValue(3_000);
    expect((await sm.get('N10E000'))?.lastAccessed).toBe(1_000);
  });
});
