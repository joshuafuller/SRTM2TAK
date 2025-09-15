import { beforeEach, afterEach } from 'vitest';

export const DB_NAME = 'srtm2tak-test';
export const DB_VERSION = 1;

/**
 * Clear all IndexedDB databases
 */
export async function clearAllDatabases(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  
  const databases = await indexedDB.databases();
  
  await Promise.all(
    databases.map(db => {
      if (db.name) {
        return deleteDatabase(db.name);
      }
    })
  );
}

/**
 * Delete a specific database
 */
export async function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const deleteReq = indexedDB.deleteDatabase(name);
    deleteReq.onsuccess = () => resolve();
    deleteReq.onerror = () => reject(deleteReq.error);
  });
}

/**
 * Create a test database with schema
 */
export async function createTestDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Create tiles store
      if (!db.objectStoreNames.contains('tiles')) {
        const tilesStore = db.createObjectStore('tiles', { keyPath: 'id' });
        tilesStore.createIndex('timestamp', 'timestamp', { unique: false });
        tilesStore.createIndex('size', 'size', { unique: false });
      }
      
      // Create sessions store
      if (!db.objectStoreNames.contains('sessions')) {
        const sessionsStore = db.createObjectStore('sessions', { keyPath: 'id' });
        sessionsStore.createIndex('created', 'created', { unique: false });
      }
      
      // Create cache metadata store
      if (!db.objectStoreNames.contains('metadata')) {
        db.createObjectStore('metadata', { keyPath: 'key' });
      }
    };
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Seed test data into database
 */
export async function seedTestData(db: IDBDatabase): Promise<void> {
  const transaction = db.transaction(['tiles', 'sessions'], 'readwrite');
  const tilesStore = transaction.objectStore('tiles');
  const sessionsStore = transaction.objectStore('sessions');
  
  // Add test tiles
  const testTiles = [
    {
      id: 'N36W112',
      data: new ArrayBuffer(1024),
      size: 1024,
      timestamp: Date.now(),
      compressed: false,
    },
    {
      id: 'N34W081',
      data: new ArrayBuffer(2048),
      size: 2048,
      timestamp: Date.now() - 3600000,
      compressed: true,
    },
  ];
  
  for (const tile of testTiles) {
    await tilesStore.add(tile);
  }
  
  // Add test session
  await sessionsStore.add({
    id: 'test-session-1',
    tiles: ['N36W112', 'N34W081'],
    created: Date.now(),
    status: 'completed',
  });
  
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Get database size
 */
export async function getDatabaseSize(db: IDBDatabase): Promise<number> {
  if ('estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    return estimate.usage || 0;
  }
  
  // Fallback: calculate manually
  let totalSize = 0;
  const transaction = db.transaction(['tiles'], 'readonly');
  const store = transaction.objectStore('tiles');
  
  return new Promise((resolve, reject) => {
    const request = store.openCursor();
    
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        const record = cursor.value;
        if (record.size) {
          totalSize += record.size;
        }
        cursor.continue();
      } else {
        resolve(totalSize);
      }
    };
    
    request.onerror = () => reject(request.error);
  });
}

/**
 * Test helper to setup and teardown database for each test
 */
export function useTestDatabase() {
  let db: IDBDatabase | null = null;
  
  beforeEach(async () => {
    await clearAllDatabases();
    db = await createTestDatabase();
  });
  
  afterEach(async () => {
    if (db) {
      // Wait a bit for any pending transactions to complete
      await new Promise(resolve => setTimeout(resolve, 10));
      
      try {
        db.close();
      } catch (e) {
        // Database might already be closed
      }
      
      await deleteDatabase(DB_NAME);
      db = null;
    }
  });
  
  return {
    getDb: () => db,
    resetDb: async () => {
      if (db) {
        db.close();
      }
      await clearAllDatabases();
      db = await createTestDatabase();
      return db;
    }
  };
}