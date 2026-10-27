/**
 * Storage Manager for IndexedDB operations
 * Handles tile caching with LRU eviction and quota management
 */

import { openDB, unwrap, IDBPDatabase, DBSchema } from 'idb';

export interface CachedTile {
  id: string;
  data: ArrayBuffer;
  size: number;
  timestamp: number;
  compressed: boolean;
  lastAccessed?: number;
  originalSize?: number;
}

export interface TileMetadata {
  id: string;
  size: number;
  timestamp: number;
  lastAccessed: number;
  compressed: boolean;
}

export interface StorageInfo {
  tileCount: number;
  totalSize: number;
  oldestTile?: TileMetadata;
  newestTile?: TileMetadata;
  quotaUsed?: number;
  quotaAvailable?: number;
}

interface SRTM2TAKDB extends DBSchema {
  tiles: {
    key: string;
    value: CachedTile;
    indexes: {
      timestamp: number;
      lastAccessed: number;
      size: number;
    };
  };
  metadata: {
    key: string;
    value: unknown;
  };
  sessions: {
    key: string;
    value: {
      id: string;
      tiles: string[];
      created: number;
      status: string;
    };
  };
}

// get() writes lastAccessed back at most this often: a write copies the whole tile
const LAST_ACCESSED_UPDATE_MS = 60 * 60 * 1000;

export class StorageManager {
  private db: IDBPDatabase<SRTM2TAKDB> | IDBDatabase | null = null;
  private maxCacheSize: number = 500 * 1024 * 1024; // 500MB default
  private quotaInfo?: { usage: number; quota: number };
  private initPromise: Promise<void> | null = null;
  
  constructor(db?: IDBDatabase) {
    if (db) {
      this.db = db;
    }
  }
  
  /**
   * Initialize storage (must be called before use)
   */
  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;
    
    this.initPromise = this.initDB();
    return this.initPromise;
  }
  
  /**
   * Check if storage is initialized
   */
  isInitialized(): boolean {
    return this.db !== null;
  }
  
  /**
   * Initialize IndexedDB connection
   */
  private async initDB(): Promise<void> {
    try {
      this.db = await openDB<SRTM2TAKDB>('srtm2tak', 1, {
      upgrade(db) {
        // Create tiles store
        if (!db.objectStoreNames.contains('tiles')) {
          const tilesStore = db.createObjectStore('tiles', { keyPath: 'id' });
          tilesStore.createIndex('timestamp', 'timestamp');
          tilesStore.createIndex('lastAccessed', 'lastAccessed');
          tilesStore.createIndex('size', 'size');
        }
        
        // Create metadata store
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'key' });
        }
        
        // Create sessions store
        if (!db.objectStoreNames.contains('sessions')) {
          db.createObjectStore('sessions', { keyPath: 'id' });
        }
      },
    });
    } catch (error) {
      console.error('Failed to open IndexedDB:', error as Error);
      throw error;
    }
  }
  
  /**
   * Store a tile in IndexedDB
   */
  async store(tile: CachedTile): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized. Call init() first.');
    }
    
    try {
      // Check quota before storing
      await this.checkQuota(tile.size);
      
      // Check if we need to evict old tiles
      const currentSize = await this.getTotalSize();
      if (currentSize + tile.size > this.maxCacheSize) {
        await this.evictLRU(tile.size);
      }
      
      // Add lastAccessed timestamp
      tile.lastAccessed = Date.now();
      
      // Store the tile using IDB shortcut
      if ('put' in this.db) {
        await this.db.put('tiles', tile);
      } else {
        // Fallback for raw IDBDatabase
        const tx = this.db.transaction(['tiles'], 'readwrite');
        const store = tx.objectStore('tiles');
        await this.putTile(store, tile);
      }
    } catch (error) {
      console.error('Error storing tile:', error as Error);
      throw error;
    }
  }
  
  /**
   * Get a tile from storage
   */
  async get(tileId: string): Promise<CachedTile | null> {
    if (!this.db) {
      console.error('Database not initialized in get()');
      throw new Error('Database not initialized. Call init() first.');
    }
    
    try {
      // Use the IDB shortcut method for simple get operations
      if ('get' in this.db) {
        const tile = await this.db.get('tiles', tileId);

        if (tile && this.needsAccessUpdate(tile)) {
          // Update last accessed time in a separate transaction
          tile.lastAccessed = Date.now();
          await this.db.put('tiles', tile);
        }

        return tile || null;
      } else {
        // Fallback for raw IDBDatabase
        const tx = this.db.transaction(['tiles'], 'readonly');
        const store = tx.objectStore('tiles');
        const tile = await this.getTile(store, tileId);
        
        if (tile && this.needsAccessUpdate(tile)) {
          // Update last accessed in separate transaction
          const updateTx = this.db.transaction(['tiles'], 'readwrite');
          const updateStore = updateTx.objectStore('tiles');
          tile.lastAccessed = Date.now();
          await this.putTile(updateStore, tile);
        }
        
        return tile;
      }
    } catch (error) {
      console.error('Error getting tile from storage:', error as Error);
      return null;
    }
  }
  
  /**
   * Delete a tile
   */
  async delete(tileId: string): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized. Call init() first.');
    }
    
    try {
      if ('delete' in this.db) {
        await this.db.delete('tiles', tileId);
      } else {
        const tx = this.db.transaction(['tiles'], 'readwrite');
        const store = tx.objectStore('tiles');
        await this.deleteTile(store, tileId);
      }
    } catch (error) {
      console.error('Error deleting tile:', error as Error);
      throw error;
    }
  }
  
  /**
   * Clear all tiles
   */
  async clear(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized. Call init() first.');
    }
    
    try {
      if ('clear' in this.db) {
        await this.db.clear('tiles');
      } else {
        const tx = this.db.transaction(['tiles'], 'readwrite');
        const store = tx.objectStore('tiles');
        await this.clearStore(store);
      }
    } catch (error) {
      console.error('Error clearing tiles:', error as Error);
      throw error;
    }
  }
  
  /**
   * Get all tiles
   */
  async getAllTiles(): Promise<CachedTile[]> {
    if (!this.db) {
      throw new Error('Database not initialized. Call init() first.');
    }
    
    try {
      if ('getAll' in this.db) {
        return await this.db.getAll('tiles');
      } else {
        const tx = this.db.transaction(['tiles'], 'readonly');
        const store = tx.objectStore('tiles');
        return this.getAllFromStore(store);
      }
    } catch (error) {
      console.error('Error getting all tiles:', error as Error);
      return [];
    }
  }
  
  /**
   * Get storage information
   */
  async getStorageInfo(): Promise<StorageInfo> {
    // Read only index keys, not the tile data
    const sizes = await this.scanIndexKeys('size');
    const byTime = await this.scanIndexKeys('timestamp');

    const info: StorageInfo = {
      tileCount: sizes.length,
      totalSize: sizes.reduce((sum, entry) => sum + Number(entry.key), 0),
    };

    if (byTime.length > 0) {
      const oldest = await this.peekTile(byTime[0].id);
      const newest = await this.peekTile(byTime[byTime.length - 1].id);
      if (oldest) info.oldestTile = this.tileToMetadata(oldest);
      if (newest) info.newestTile = this.tileToMetadata(newest);
    }
    
    // Get quota if available
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      info.quotaUsed = estimate.usage;
      info.quotaAvailable = estimate.quota;
    }
    
    return info;
  }
  
  /**
   * Get tile metadata without loading data
   */
  async getTileMetadata(tileId: string): Promise<TileMetadata | null> {
    const tile = await this.get(tileId);
    return tile ? this.tileToMetadata(tile) : null;
  }
  
  /**
   * Prune tiles older than specified days
   */
  async pruneOldTiles(days: number): Promise<number> {
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    const tiles = await this.getAllTiles();
    let pruned = 0;
    
    for (const tile of tiles) {
      if (tile.timestamp < cutoff) {
        await this.delete(tile.id);
        pruned++;
      }
    }
    
    return pruned;
  }
  
  /**
   * Set maximum cache size
   */
  setMaxCacheSize(bytes: number): void {
    this.maxCacheSize = bytes;
  }
  
  /**
   * Set quota information (for testing)
   */
  setQuotaInfo(info: { usage: number; quota: number }): void {
    this.quotaInfo = info;
  }
  
  /**
   * Check available quota
   */
  private async checkQuota(sizeNeeded: number): Promise<void> {
    let quota = this.quotaInfo;
    
    if (!quota && 'storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      quota = {
        usage: estimate.usage || 0,
        quota: estimate.quota || Infinity,
      };
    }
    
    if (quota && quota.usage + sizeNeeded > quota.quota) {
      throw new Error('Storage quota would be exceeded');
    }
  }
  
  /**
   * Evict least recently used tiles
   */
  private async evictLRU(sizeNeeded: number): Promise<void> {
    // Read only index keys, not the tile data
    const sizeById = new Map<string, number>();
    for (const entry of await this.scanIndexKeys('size')) {
      sizeById.set(entry.id, Number(entry.key));
    }
    // Oldest access first; fall back to timestamp if the index is missing
    const order = this.hasIndex('lastAccessed')
      ? await this.scanIndexKeys('lastAccessed')
      : await this.scanIndexKeys('timestamp');

    let freedSpace = 0;
    const currentSize = [...sizeById.values()].reduce((sum, size) => sum + size, 0);
    const targetSize = this.maxCacheSize - sizeNeeded;

    for (const { id } of order) {
      if (currentSize - freedSpace <= targetSize) {
        break;
      }

      await this.delete(id);
      freedSpace += sizeById.get(id) ?? 0;
    }
  }
  
  /**
   * Get total size of cached tiles
   */
  private async getTotalSize(): Promise<number> {
    const sizes = await this.scanIndexKeys('size');
    return sizes.reduce((sum, entry) => sum + Number(entry.key), 0);
  }

  /**
   * IDs of all cached tiles, without loading tile data
   */
  async getTileIds(): Promise<string[]> {
    const entries = await this.scanIndexKeys('size');
    return entries.map((entry) => entry.id);
  }

  /**
   * True when get() should write a new lastAccessed time
   */
  private needsAccessUpdate(tile: CachedTile): boolean {
    return Date.now() - (tile.lastAccessed ?? 0) >= LAST_ACCESSED_UPDATE_MS;
  }

  /**
   * Raw IDBDatabase for both the idb wrapper and a raw database
   */
  private rawDb(): IDBDatabase {
    if (!this.db) {
      throw new Error('Database not initialized. Call init() first.');
    }
    return 'put' in this.db ? unwrap(this.db) : this.db;
  }

  private hasIndex(name: string): boolean {
    return this.rawDb().transaction(['tiles'], 'readonly').objectStore('tiles').indexNames.contains(name);
  }

  /**
   * Walk an index with a key cursor: gives (index key, tile id) in index
   * order without reading the tile records
   */
  private scanIndexKeys(indexName: string): Promise<Array<{ key: IDBValidKey; id: string }>> {
    return new Promise((resolve, reject) => {
      const entries: Array<{ key: IDBValidKey; id: string }> = [];
      const index = this.rawDb().transaction(['tiles'], 'readonly').objectStore('tiles').index(indexName);
      const request = index.openKeyCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve(entries);
          return;
        }
        // Tile IDs are the store's string keyPath
        entries.push({ key: cursor.key, id: cursor.primaryKey as string });
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Read one tile without changing lastAccessed
   */
  private peekTile(id: string): Promise<CachedTile | null> {
    const store = this.rawDb().transaction(['tiles'], 'readonly').objectStore('tiles');
    return this.getTile(store, id);
  }
  
  /**
   * Convert tile to metadata
   */
  private tileToMetadata(tile: CachedTile): TileMetadata {
    return {
      id: tile.id,
      size: tile.size,
      timestamp: tile.timestamp,
      lastAccessed: tile.lastAccessed || tile.timestamp,
      compressed: tile.compressed,
    };
  }
  
  /**
   * Helper methods for working with both IDB types
   */
  private getTransaction(stores: string[], mode: IDBTransactionMode): IDBTransaction {
    if (!this.db) {
      console.error('Database is null in getTransaction');
      throw new Error('Database not initialized');
    }
    if ('transaction' in this.db) {
      const tx = (this.db as IDBDatabase).transaction(stores, mode);
      return tx;
    }
    throw new Error('Database does not support transactions');
  }
  
  private async getTile(store: IDBObjectStore, id: string): Promise<CachedTile | null> {
    return new Promise((resolve, reject) => {
      try {
        const request = store.get(id);
        request.onsuccess = (): void => {
          resolve((request.result as CachedTile) || null);
        };
        request.onerror = (): void => {
          console.error('Request error:', request.error);
          reject(request.error);
        };
      } catch (error) {
        console.error('Error creating request:', error as Error);
        reject(error);
      }
    });
  }
  
  private async putTile(store: IDBObjectStore, tile: CachedTile): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = store.put(tile);
      request.onsuccess = (): void => resolve();
      request.onerror = (): void => reject(request.error);
    });
  }
  
  private async deleteTile(store: IDBObjectStore, id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = (): void => resolve();
      request.onerror = (): void => reject(request.error);
    });
  }
  
  private async clearStore(store: IDBObjectStore): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = (): void => resolve();
      request.onerror = (): void => reject(request.error);
    });
  }
  
  private async getAllFromStore(store: IDBObjectStore): Promise<CachedTile[]> {
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = (): void => resolve(request.result || []);
      request.onerror = (): void => reject(request.error);
    });
  }
}
