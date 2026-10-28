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
  
  
  
}
