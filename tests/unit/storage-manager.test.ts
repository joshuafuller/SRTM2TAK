import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StorageManager } from '@/lib/storage-manager';
import { useTestDatabase } from '../utils/indexeddb-helper';

describe('StorageManager', () => {
  const { getDb } = useTestDatabase();
  let storageManager: StorageManager;

  beforeEach(async () => {
    const db = getDb();
    storageManager = new StorageManager(db!);
    await storageManager.init();
  }, 30000); // Increase timeout for database operations
  
  describe('store', () => {
    it('should store tiles in IndexedDB', async () => {
      const tile = {
        id: 'N36W112',
        data: new ArrayBuffer(25934402),
        compressed: false,
        timestamp: Date.now(),
        size: 25934402,
      };
      
      await storageManager.store(tile);
      
      const retrieved = await storageManager.get('N36W112');
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('N36W112');
      expect(retrieved?.size).toBe(25934402);
    });
    
    it.skip('should check quota before storing', async () => {
      // Mock quota exceeded
      const mockQuota = {
        usage: 450 * 1024 * 1024,
        quota: 500 * 1024 * 1024,
      };
      
      storageManager.setQuotaInfo(mockQuota);
      
      const largeTile = {
        id: 'N36W112',
        data: new ArrayBuffer(60 * 1024 * 1024), // 60MB - would exceed quota
        size: 60 * 1024 * 1024,
        timestamp: Date.now(),
        compressed: false,
      };
      
      await expect(storageManager.store(largeTile)).rejects.toThrow(/quota/i);
    });
    
    it.skip('should implement LRU eviction when space needed', async () => {
      // Set a small quota
      storageManager.setMaxCacheSize(50 * 1024 * 1024); // 50MB
      
      // Store old tiles
      const oldTile1 = {
        id: 'N36W112',
        data: new ArrayBuffer(20 * 1024 * 1024),
        size: 20 * 1024 * 1024,
        timestamp: Date.now() - 7 * 24 * 60 * 60 * 1000, // 1 week old
        compressed: false,
      };
      
      const oldTile2 = {
        id: 'N36W113',
        data: new ArrayBuffer(20 * 1024 * 1024),
        size: 20 * 1024 * 1024,
        timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000, // 3 days old
        compressed: false,
      };
      
      await storageManager.store(oldTile1);
      await storageManager.store(oldTile2);
      
      // Store new tile that requires eviction
      const newTile = {
        id: 'N37W112',
        data: new ArrayBuffer(25 * 1024 * 1024),
        size: 25 * 1024 * 1024,
        timestamp: Date.now(),
        compressed: false,
      };
      
      await storageManager.store(newTile);
      
      // Oldest tile should be evicted
      expect(await storageManager.get('N36W112')).toBeNull();
      expect(await storageManager.get('N36W113')).toBeDefined();
      expect(await storageManager.get('N37W112')).toBeDefined();
    });
  });
  
  describe('get', () => {
    it.skip('should retrieve stored tiles', async () => {
      const tile = {
        id: 'N36W112',
        data: new ArrayBuffer(1024),
        size: 1024,
        timestamp: Date.now(),
        compressed: false,
      };
      
      await storageManager.store(tile);
      const retrieved = await storageManager.get('N36W112');
      
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('N36W112');
    });
    
    it.skip('should return null for non-existent tiles', async () => {
      const retrieved = await storageManager.get('N99W999');
      expect(retrieved).toBeNull();
    });
    
    it.skip('should update last accessed timestamp', async () => {
      const tile = {
        id: 'N36W112',
        data: new ArrayBuffer(1024),
        size: 1024,
        timestamp: Date.now() - 1000000,
        compressed: false,
      };
      
      await storageManager.store(tile);
      const before = Date.now();
      
      await storageManager.get('N36W112');
      
      const metadata = await storageManager.getTileMetadata('N36W112');
      expect(metadata?.lastAccessed).toBeGreaterThanOrEqual(before);
    });
  });
  
  describe('delete', () => {
    it.skip('should delete tiles', async () => {
      const tile = {
        id: 'N36W112',
        data: new ArrayBuffer(1024),
        size: 1024,
        timestamp: Date.now(),
        compressed: false,
      };
      
      await storageManager.store(tile);
      await storageManager.delete('N36W112');
      
      const retrieved = await storageManager.get('N36W112');
      expect(retrieved).toBeNull();
    });
  });
  
  describe('clear', () => {
    it.skip('should clear all tiles', async () => {
      // Store multiple tiles
      for (let i = 0; i < 5; i++) {
        await storageManager.store({
          id: `N${36 + i}W112`,
          data: new ArrayBuffer(1024),
          size: 1024,
          timestamp: Date.now(),
          compressed: false,
        });
      }
      
      await storageManager.clear();
      
      const allTiles = await storageManager.getAllTiles();
      expect(allTiles).toHaveLength(0);
    });
  });
  
  describe('getStorageInfo', () => {
    it.skip('should return storage information', async () => {
      // Store some tiles
      await storageManager.store({
        id: 'N36W112',
        data: new ArrayBuffer(25934402),
        size: 25934402,
        timestamp: Date.now(),
        compressed: false,
      });
      
      await storageManager.store({
        id: 'N36W113',
        data: new ArrayBuffer(25934402),
        size: 25934402,
        timestamp: Date.now(),
        compressed: false,
      });
      
      const info = await storageManager.getStorageInfo();
      
      expect(info.tileCount).toBe(2);
      expect(info.totalSize).toBe(25934402 * 2);
      expect(info.oldestTile).toBeDefined();
      expect(info.newestTile).toBeDefined();
    });
  });
  
  describe('pruneOldTiles', () => {
    it.skip('should remove tiles older than specified age', async () => {
      const now = Date.now();
      
      // Store tiles with different ages
      await storageManager.store({
        id: 'N36W112',
        data: new ArrayBuffer(1024),
        size: 1024,
        timestamp: now - 8 * 24 * 60 * 60 * 1000, // 8 days old
        compressed: false,
      });
      
      await storageManager.store({
        id: 'N36W113',
        data: new ArrayBuffer(1024),
        size: 1024,
        timestamp: now - 2 * 24 * 60 * 60 * 1000, // 2 days old
        compressed: false,
      });
      
      // Prune tiles older than 7 days
      const pruned = await storageManager.pruneOldTiles(7);
      
      expect(pruned).toBe(1);
      expect(await storageManager.get('N36W112')).toBeNull();
      expect(await storageManager.get('N36W113')).toBeDefined();
    });
  });
  
  describe('compression', () => {
    it.skip('should store compressed tiles', async () => {
      const uncompressedData = new ArrayBuffer(25934402);
      const compressedData = new ArrayBuffer(6500000); // ~6.5MB compressed
      
      const tile = {
        id: 'N36W112',
        data: compressedData,
        originalData: uncompressedData,
        size: 6500000,
        originalSize: 25934402,
        timestamp: Date.now(),
        compressed: true,
      };
      
      await storageManager.store(tile);
      
      const retrieved = await storageManager.get('N36W112');
      expect(retrieved?.compressed).toBe(true);
      expect(retrieved?.size).toBe(6500000);
    });
  });
});