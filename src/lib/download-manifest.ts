/**
 * Download Manifest for managing download sessions
 * Handles persistence and resumption of interrupted downloads
 */

import { DownloadSession, AreaSelection, DownloadStatus, DownloadProgress } from '@/models';
import { openDB, IDBPDatabase, DBSchema } from 'idb';

interface SessionsDB extends DBSchema {
  sessions: {
    key: string;
    value: DownloadSession;
    indexes: { created: number };
  };
}

export class DownloadManifest {
  private static readonly STORAGE_KEY = 'srtm2tak_download_sessions';
  private static readonly MAX_SESSIONS = 10;
  private static dbPromise: Promise<IDBPDatabase<SessionsDB>> | null = null;

  private static getDB(): Promise<IDBPDatabase<SessionsDB>> {
    if (!this.dbPromise) {
      this.dbPromise = openDB('srtm2tak', 1, {
        upgrade(db) {
          if (!db.objectStoreNames.contains('sessions')) {
            const store = db.createObjectStore('sessions', { keyPath: 'id' });
            store.createIndex('created', 'startTime');
          }
        },
      });
    }
    return this.dbPromise;
  }
  
  /**
   * Save a download session to localStorage
   */
  static save(session: DownloadSession): void {
    try {
      const sessions = this.getAllSessions();
      
      // Update existing or add new
      const index = sessions.findIndex(s => s.id === session.id);
      if (index >= 0) {
        sessions[index] = session;
      } else {
        sessions.unshift(session); // Add to beginning
      }
      
      // Limit stored sessions
      if (sessions.length > this.MAX_SESSIONS) {
        sessions.splice(this.MAX_SESSIONS);
      }
      
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(sessions));

      // Also persist to IndexedDB asynchronously
      void (async (): Promise<void> => {
        try {
          const db = await this.getDB();
          await db.put('sessions', session);
        } catch (e) {
          console.warn('Failed to persist session to IndexedDB:', e);
        }
      })();
    } catch (error) {
      console.error('Failed to save download session:', error);
    }
  }
  
  /**
   * Resume a download session
   */
  static resume(sessionId: string): DownloadSession | null {
    try {
      const sessions = this.getAllSessions();
      const session = sessions.find(s => s.id === sessionId);
      
      if (session && session.resumable && session.status !== 'completed') {
        return session;
      }
      
      return null;
    } catch (error) {
      console.error('Failed to resume download session:', error);
      return null;
    }
  }
  
  /**
   * Get all saved sessions
   */
  static getAllSessions(): DownloadSession[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored) as DownloadSession[];
      }
    } catch (error) {
      console.error('Failed to load download sessions:', error);
    }
    return [];
  }
  
  /**
   * Get resumable sessions
   */
  static getResumableSessions(): DownloadSession[] {
    return this.getAllSessions().filter(
      s => s.resumable && s.status !== 'completed' && s.status !== 'failed'
    );
  }
  
  /**
   * Delete a session
   */
  static delete(sessionId: string): void {
    try {
      const sessions = this.getAllSessions();
      const filtered = sessions.filter(s => s.id !== sessionId);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered));

      // Also delete from IndexedDB asynchronously
      void (async (): Promise<void> => {
        try {
          const db = await this.getDB();
          await db.delete('sessions', sessionId);
        } catch (e) {
          console.warn('Failed to delete session from IndexedDB:', e);
        }
      })();
    } catch (error) {
      console.error('Failed to delete download session:', error);
    }
  }
  
  /**
   * Clear all sessions
   */
  static clearAll(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      // Clear IDB asynchronously
      void (async (): Promise<void> => {
        try {
          const db = await this.getDB();
          const tx = db.transaction('sessions', 'readwrite');
          await tx.store.clear();
          await tx.done;
        } catch (e) {
          console.warn('Failed to clear sessions from IndexedDB:', e);
        }
      })();
    } catch (error) {
      console.error('Failed to clear download sessions:', error);
    }
  }
  
  /**
   * Create a new download session
   */
  static createSession(
    selection: AreaSelection,
    tiles: string[],
    outputFormat: 'zip' | 'folder' = 'zip'
  ): DownloadSession {
    const now = Date.now();
    
    return {
      id: `session-${now}-${Math.random().toString(36).substr(2, 9)}`,
      selection,
      tiles,
      completed: [],
      failed: [],
      skipped: [],
      status: 'pending',
      progress: {
        current: 0,
        total: tiles.length,
        percent: 0,
        bytesDownloaded: 0,
        bytesTotal: selection.estimatedSize.compressed,
        speed: 0,
        timeElapsed: 0,
        timeRemaining: 0,
      },
      startTime: now,
      resumable: true,
      outputFormat,
    };
  }
  
  /**
   * Update session progress
   */
  static updateProgress(
    session: DownloadSession,
    updates: Partial<DownloadProgress>
  ): DownloadSession {
    const updated = {
      ...session,
      progress: {
        ...session.progress,
        ...updates,
      },
    };
    
    // Calculate percentage
    if (updated.progress.total > 0) {
      updated.progress.percent = Math.round(
        (updated.progress.current / updated.progress.total) * 100
      );
    }
    
    // Calculate time remaining
    if (updated.progress.speed > 0 && updated.progress.bytesTotal > 0) {
      const bytesRemaining = updated.progress.bytesTotal - updated.progress.bytesDownloaded;
      updated.progress.timeRemaining = Math.round(bytesRemaining / updated.progress.speed * 1000);
    }
    
    return updated;
  }
  
  /**
   * Update session status
   */
  static updateStatus(
    session: DownloadSession,
    status: DownloadStatus,
    error?: string
  ): DownloadSession {
    const updated = {
      ...session,
      status,
      error,
    };
    
    // Set end time if completed or failed
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      updated.endTime = Date.now();
      updated.resumable = false;
    }
    
    // Update resumable flag for paused
    if (status === 'paused') {
      updated.resumable = true;
    }
    
    return updated;
  }
  
  /**
   * Mark tile as completed
   */
  static markTileCompleted(
    session: DownloadSession,
    tileId: string
  ): DownloadSession {
    if (!session.completed.includes(tileId)) {
      session.completed.push(tileId);
    }
    
    // Remove from failed if it was there
    session.failed = session.failed.filter(id => id !== tileId);
    
    // Update progress
    session.progress.current = session.completed.length + session.skipped.length;
    
    return session;
  }
  
  /**
   * Mark tile as failed
   */
  static markTileFailed(
    session: DownloadSession,
    tileId: string
  ): DownloadSession {
    if (!session.failed.includes(tileId)) {
      session.failed.push(tileId);
    }
    
    // Remove from completed if it was there
    session.completed = session.completed.filter(id => id !== tileId);
    
    return session;
  }
  
  /**
   * Mark tile as skipped (already cached)
   */
  static markTileSkipped(
    session: DownloadSession,
    tileId: string
  ): DownloadSession {
    if (!session.skipped.includes(tileId)) {
      session.skipped.push(tileId);
    }
    
    // Update progress
    session.progress.current = session.completed.length + session.skipped.length;
    
    return session;
  }
  
  /**
   * Get tiles that still need to be downloaded
   */
  static getRemainingTiles(session: DownloadSession): string[] {
    const processed = new Set([
      ...session.completed,
      ...session.skipped,
    ]);
    
    return session.tiles.filter(tile => !processed.has(tile));
  }
  
  /**
   * Calculate session statistics
   */
  static getStatistics(session: DownloadSession): {
    successRate: number;
    averageSpeed: number;
    totalTime: number;
    tilesPerMinute: number;
  } {
    const totalProcessed = session.completed.length + session.failed.length + session.skipped.length;
    const successRate = totalProcessed > 0 
      ? (session.completed.length / totalProcessed) * 100 
      : 0;
    
    const totalTime = (session.endTime || Date.now()) - session.startTime;
    const averageSpeed = session.progress.bytesDownloaded / (totalTime / 1000);
    const tilesPerMinute = (session.completed.length / (totalTime / 60000));
    
    return {
      successRate,
      averageSpeed,
      totalTime,
      tilesPerMinute,
    };
  }
  
  /**
   * Export session as JSON
   */
  static export(session: DownloadSession): string {
    return JSON.stringify(session, null, 2);
  }
  
  /**
   * Import session from JSON
   */
  static import(json: string): DownloadSession | null {
    try {
      const session = JSON.parse(json) as DownloadSession;
      
      // Validate required fields
      if (session.id && session.tiles && Array.isArray(session.tiles)) {
        return session;
      }
    } catch (error) {
      console.error('Failed to import download session:', error);
    }
    
    return null;
  }
  
  /**
   * Clean up old sessions
   */
  static cleanup(daysOld: number = 7): number {
    const cutoff = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
    const sessions = this.getAllSessions();
    const filtered = sessions.filter(s => {
      // Keep recent sessions
      if (s.startTime > cutoff) return true;
      
      // Keep resumable sessions
      if (s.resumable && s.status !== 'completed') return true;
      
      return false;
    });
    
    const removed = sessions.length - filtered.length;
    
    if (removed > 0) {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered));
      // Also clean IndexedDB asynchronously
      void (async (): Promise<void> => {
        try {
          const db = await this.getDB();
          const tx = db.transaction('sessions', 'readwrite');
          const store = tx.store;
          // Simple approach: clear and reinsert filtered
          await store.clear();
          for (const s of filtered) {
            await store.put(s);
          }
          await tx.done;
        } catch (e) {
          console.warn('Failed to cleanup sessions in IndexedDB:', e);
        }
      })();
    }
    
    return removed;
  }
}
