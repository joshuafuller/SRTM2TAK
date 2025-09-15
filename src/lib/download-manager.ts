/**
 * Download Manager for coordinating tile downloads
 */

import { TileFetcher } from './tile-fetcher';
import { StreamZip } from './stream-zip';
import { StorageManager } from './storage-manager';
import { MemoryMonitor } from './memory-monitor';
import { Decompressor } from './decompressor';
import { DownloadManifest } from './download-manifest';
import { AreaSelection, DownloadSession, DownloadProgress } from '@/models';

export interface DownloadManagerOptions {
  concurrentDownloads?: number;
  retryAttempts?: number;
  retryDelay?: number;
  useCache?: boolean;
  onProgress?: (progress: DownloadProgress) => void;
  onTileStart?: (tileId: string) => void;
  onTileComplete?: (tileId: string, success: boolean) => void;
  onComplete?: (blob: Blob) => void;
  onError?: (error: Error) => void;
}

export class DownloadManager {
  private fetcher: TileFetcher;
  private storage: StorageManager;
  private monitor: MemoryMonitor;
  private streamZip: StreamZip;
  private currentSession: DownloadSession | null = null;
  private abortController: AbortController | null = null;
  private downloadStartTime: number = 0;
  private bytesDownloaded: number = 0;
  private totalEstimatedBytes: number = 0;
  private tileBytesLoaded: Map<string, number> = new Map();
  
  constructor(private options: DownloadManagerOptions = {}) {
    this.fetcher = new TileFetcher({
      maxRetries: options.retryAttempts || 3,
      retryDelay: options.retryDelay || 1000,
      onProgress: (p): void => this.handleNetworkProgress(p),
    });
    
    this.storage = new StorageManager();
    this.monitor = new MemoryMonitor();
    this.streamZip = new StreamZip();
    
    // Initialize storage
    void this.initStorage();
  }
  
  private async initStorage(): Promise<void> {
    try {
      await this.storage.init();
    } catch (error) {
      console.warn('Failed to initialize storage, caching disabled:', error);
    }
  }
  
  /**
   * Start downloading tiles
   */
  async startDownload(
    tileIds: string[],
    selection?: AreaSelection
  ): Promise<Blob> {

    // Input validation
    if (!tileIds || tileIds.length === 0) {
      throw new Error('No tiles to download');
    }

    // Security: Limit maximum tiles to prevent DoS
    const MAX_TILES = 10000;
    if (tileIds.length > MAX_TILES) {
      throw new Error(`Too many tiles requested (${tileIds.length}). Maximum allowed: ${MAX_TILES}`);
    }

    // Ensure storage is initialized
    try {
      await this.initStorage();
    } catch (error) {
      console.warn('Storage init failed, continuing without cache:', error);
    }

    // Check memory before starting
    const memStatus = this.monitor.getMemoryStatus();
    if (memStatus.level === 'critical') {
      throw new Error('Insufficient memory to start download');
    }
    
    // Create abort controller
    this.abortController = new AbortController();
    
    // Create download session
    if (selection) {
      this.currentSession = DownloadManifest.createSession(
        selection,
        tileIds,
        'zip'
      );
      this.currentSession.status = 'downloading';
      DownloadManifest.save(this.currentSession);
    }
    
    // Reset counters
    this.downloadStartTime = Date.now();
    this.bytesDownloaded = 0;
    this.tileBytesLoaded.clear();
    // Estimate total compressed size for progress
    this.totalEstimatedBytes = tileIds.length * 6.5 * 1024 * 1024;
    
    try {
      // Build iterator that includes cached tiles first (preserving original order), then remaining via pool
      let tileIterator: AsyncIterable<{ id: string; data: ArrayBuffer }>;
      if (this.options.useCache !== false && this.storage.isInitialized()) {
        // Determine cached and remaining in one pass (preserving original order)
        const cachedSet = await this.getCachedTiles(tileIds);
        const cachedOrder = tileIds.filter(id => cachedSet.has(id));
        const remaining = tileIds.filter(id => !cachedSet.has(id));

        // Use the unified iterator that handles both cached and network tiles with proper concurrency
        tileIterator = this.createUnifiedIterator(tileIds);
      } else {
        tileIterator = this.createTileIterator(tileIds);
      }
      
      // Create ZIP blob
      const blob = await this.streamZip.createZip(tileIterator);
      
      
      // Mark session as completed
      if (this.currentSession) {
        this.currentSession = DownloadManifest.updateStatus(
          this.currentSession,
          'completed'
        );
        DownloadManifest.save(this.currentSession);
      }
      
      // Call completion callback
      this.options.onComplete?.(blob);
      
      return blob;
    } catch (error) {
      const err = error as Error;
      const isAbort = (err as Error & { name?: string })?.name === 'AbortError' || /cancelled/i.test(err.message || '');
      if (this.currentSession) {
        this.currentSession = DownloadManifest.updateStatus(
          this.currentSession,
          isAbort ? 'cancelled' : 'failed',
          isAbort ? undefined : (err.message || 'Unknown error')
        );
        DownloadManifest.save(this.currentSession);
      }
      if (!isAbort) {
        this.options.onError?.(err);
      }
      throw err;
    }
  }

  /**
   * Handle per-chunk network progress updates
   */
  private handleNetworkProgress(p: { tileId: string; loaded: number; total: number }): void {
    const prev = this.tileBytesLoaded.get(p.tileId) || 0;
    const delta = Math.max(0, p.loaded - prev);
    if (delta > 0) {
      this.bytesDownloaded += delta;
      this.tileBytesLoaded.set(p.tileId, p.loaded);
    }

    // Emit streaming progress to UI if available
    if (this.options.onProgress) {
      const now = Date.now();
      const elapsed = now - this.downloadStartTime;
      const speed = elapsed > 0 ? this.bytesDownloaded / (elapsed / 1000) : 0;

      const progress: DownloadProgress = {
        current: this.currentSession ? (this.currentSession.completed.length + this.currentSession.skipped.length) : 0,
        total: this.currentSession ? this.currentSession.tiles.length : 0,
        percent: this.currentSession && this.currentSession.tiles.length > 0
          ? Math.min(99, Math.round(((this.currentSession.completed.length + this.currentSession.skipped.length) / this.currentSession.tiles.length) * 100))
          : 0,
        bytesDownloaded: this.bytesDownloaded,
        bytesTotal: this.totalEstimatedBytes,
        speed,
        timeElapsed: elapsed,
        timeRemaining: speed > 0 ? Math.max(0, Math.round(((this.totalEstimatedBytes - this.bytesDownloaded) / speed) * 1000)) : 0,
      };
      this.options.onProgress(progress);
    }
  }
  
  /**
   * Resume a download session
   */
  async resumeDownload(sessionId: string): Promise<Blob> {
    const session = DownloadManifest.resume(sessionId);
    if (!session) {
      throw new Error('Session not found or not resumable');
    }
    
    this.currentSession = session;
    this.currentSession.status = 'downloading';
    DownloadManifest.save(this.currentSession);
    
    // Get remaining tiles
    const remainingTiles = DownloadManifest.getRemainingTiles(session);
    
    // Continue download
    return this.startDownload(remainingTiles, session.selection);
  }
  
  /**
   * Cancel current download
   */
  cancelDownload(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    
    if (this.currentSession) {
      this.currentSession = DownloadManifest.updateStatus(
        this.currentSession,
        'cancelled'
      );
      DownloadManifest.save(this.currentSession);
    }
  }
  
  /**
   * Pause current download
   */
  pauseDownload(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    
    if (this.currentSession) {
      this.currentSession = DownloadManifest.updateStatus(
        this.currentSession,
        'paused'
      );
      DownloadManifest.save(this.currentSession);
    }
  }
  
  /**
   * Create async iterator for tiles
   */
  private async *createTileIterator(
    tileIds: string[]
  ): AsyncGenerator<{ id: string; data: ArrayBuffer }> {
    const total = tileIds.length;
    let completed = 0;
    // Validate and clamp concurrency to safe range
    const requestedConcurrency = this.options.concurrentDownloads ?? 3;
    const concurrency = Math.max(1, Math.min(10, requestedConcurrency));

    const inFlight = new Set<Promise<{ id: string; data: ArrayBuffer } | null>>();
    let index = 0;

    const launchNext = (): void => {
      if (index >= tileIds.length) return;
      const tileId = tileIds[index++];
      const p = this.processTile(tileId)
        .catch((err) => {
          console.error(`Failed to process tile ${tileId}:`, err);
          return null;
        })
        .finally(() => {
          inFlight.delete(p);
        }) as Promise<{ id: string; data: ArrayBuffer } | null>;
      inFlight.add(p);
    };

    while (inFlight.size < concurrency && index < tileIds.length) {
      launchNext();
    }

    while (inFlight.size > 0) {
      if (this.abortController?.signal.aborted) {
        throw new DOMException('Download cancelled', 'AbortError');
      }
      const result = await Promise.race(inFlight);
      // Keep pool full
      while (inFlight.size < concurrency && index < tileIds.length) {
        launchNext();
      }

      completed++;
      this.updateProgress(completed, total);
      if (result && result.data.byteLength > 0) {
        yield result;
      }
    }
  }

  /**
   * Unified async iterator that yields all tiles (cached or network) honoring concurrency
   */
  private async *createUnifiedIterator(
    tileIds: string[]
  ): AsyncGenerator<{ id: string; data: ArrayBuffer }> {
    const total = tileIds.length;
    let completed = 0;
    // Validate and clamp concurrency to safe range
    const requestedConcurrency = this.options.concurrentDownloads ?? 3;
    const concurrency = Math.max(1, Math.min(10, requestedConcurrency));

    type Result = { id: string; data: ArrayBuffer } | null;
    type WrappedResult = { promise: Promise<WrappedResult>, result: Result };
    const inFlight = new Set<Promise<WrappedResult>>();
    let index = 0;

    const launchNext = (): void => {
      if (index >= tileIds.length) return;
      const tileId = tileIds[index++];

      // Create self-referencing promise to avoid race condition
      let promiseRef: Promise<WrappedResult>;
      promiseRef = (async () => {
        try {
          const result = await this.processUnifiedTile(tileId);
          return { promise: promiseRef, result };
        } catch (err) {
          console.error(`Failed to process tile ${tileId}:`, err);
          return { promise: promiseRef, result: null };
        }
      })();

      inFlight.add(promiseRef);
    };

    while (inFlight.size < concurrency && index < tileIds.length) {
      launchNext();
    }

    while (inFlight.size > 0) {
      if (this.abortController?.signal.aborted) {
        throw new DOMException('Download cancelled', 'AbortError');
      }
      const { promise, result } = await Promise.race(inFlight);
      inFlight.delete(promise);

      while (inFlight.size < concurrency && index < tileIds.length) {
        launchNext();
      }

      completed++;
      this.updateProgress(completed, total);
      if (result && result.data.byteLength > 0) {
        yield result;
      }
    }
  }

  private async processUnifiedTile(tileId: string): Promise<{ id: string; data: ArrayBuffer }> {
    // cancellation & memory checks
    if (this.abortController?.signal.aborted) throw new DOMException('Download cancelled', 'AbortError');
    const mem = this.monitor.getMemoryStatus();
    if (mem.level === 'critical') throw new Error('Out of memory');
    if (mem.level === 'warning') await new Promise((r) => setTimeout(r, 300));

    let data: ArrayBuffer | null = null;
    // Try cache first if enabled
    if (this.options.useCache !== false && this.storage.isInitialized()) {
      try {
        const entry = await this.storage.get(tileId);
        if (entry && entry.data && entry.data.byteLength > 0) {
          data = entry.data;
        }
      } catch {
        // ignore
      }
    }
    if (!data) {
      this.options.onTileStart?.(tileId);
      data = await this.downloadTile(tileId);
      if (data && data.byteLength > 0 && this.options.useCache !== false && this.storage.isInitialized()) {
        try {
          await this.storage.store({
            id: tileId,
            data,
            timestamp: Date.now(),
            lastAccessed: Date.now(),
            size: data.byteLength,
            compressed: true,
          });
        } catch {
          // ignore cache store issues
        }
      }
    }

    if (!data || data.byteLength === 0) {
      this.options.onTileComplete?.(tileId, false);
      if (this.currentSession) this.currentSession = DownloadManifest.markTileFailed(this.currentSession, tileId);
      return { id: tileId, data: new ArrayBuffer(0) };
    }

    const decompressed = Decompressor.decompress(data);
    if (this.currentSession) this.currentSession = DownloadManifest.markTileCompleted(this.currentSession, tileId);
    this.options.onTileComplete?.(tileId, true);
    return { id: tileId, data: decompressed };
  }

  private async processTile(tileId: string): Promise<{ id: string; data: ArrayBuffer }> {
    // Cancel check
    if (this.abortController?.signal.aborted) {
      throw new Error('Download cancelled');
    }
    // Memory pressure
    const mem = this.monitor.getMemoryStatus();
    if (mem.level === 'critical') {
      throw new Error('Out of memory');
    }
    if (mem.level === 'warning') {
      await new Promise((r) => setTimeout(r, 300));
    }

    let tileData: ArrayBuffer | null = null;

    if (this.options.useCache !== false && this.storage.isInitialized()) {
      try {
        const cached = await this.storage.get(tileId);
        if (cached) {
          tileData = cached.data;
          if (this.currentSession) {
            // Treat cached tiles as completed, since they will be included in the ZIP
            this.currentSession = DownloadManifest.markTileCompleted(this.currentSession, tileId);
          }
        }
      } catch (e) {
        console.warn(`Cache error for ${tileId}, proceeding to download:`, e);
      }
    }

    if (!tileData) {
      this.options.onTileStart?.(tileId);
      tileData = await this.downloadTile(tileId);
      if (tileData && tileData.byteLength > 0) {
        if (this.options.useCache !== false && this.storage.isInitialized()) {
          try {
            await this.storage.store({
              id: tileId,
              data: tileData,
              timestamp: Date.now(),
              lastAccessed: Date.now(),
              size: tileData.byteLength,
              compressed: true,
            });
          } catch (e) {
            console.warn(`Failed to cache tile ${tileId}:`, e);
          }
        }
        if (this.currentSession) {
          this.currentSession = DownloadManifest.markTileCompleted(this.currentSession, tileId);
        }
      }
    }

    if (!tileData || tileData.byteLength === 0) {
      this.options.onTileComplete?.(tileId, false);
      return { id: tileId, data: new ArrayBuffer(0) };
    }

    const decompressed = Decompressor.decompress(tileData);
    this.options.onTileComplete?.(tileId, true);
    return { id: tileId, data: decompressed };
  }

  /**
   * Return set of tiles already cached (compressed)
   */
  async getCachedTiles(tileIds: string[]): Promise<Set<string>> {
    const cached = new Set<string>();
    try {
      await this.initStorage();
    } catch {
      return cached;
    }
    if (!this.storage.isInitialized()) return cached;

    for (const id of tileIds) {
      try {
        const entry = await this.storage.get(id);
        if (entry && entry.data && entry.size > 0) {
          cached.add(id);
        }
      } catch {
        // ignore
      }
    }
    return cached;
  }
  
  /**
   * Download a single tile
   */
  private async downloadTile(tileId: string): Promise<ArrayBuffer> {
    // Timing removed to eliminate unused variable
    
    const data = await this.fetcher.fetch(tileId, this.abortController?.signal);
    
    if (!data) {
      // Ocean tile or missing data - return empty buffer
      return new ArrayBuffer(0);
    }
    
    
    return data;
  }
  
  /**
   * Update download progress
   */
  private updateProgress(current: number, total: number): void {
    const now = Date.now();
    const elapsed = now - this.downloadStartTime;
    const speed = elapsed > 0 ? this.bytesDownloaded / (elapsed / 1000) : 0;
    
    const progress: DownloadProgress = {
      current,
      total,
      percent: Math.round((current / total) * 100),
      bytesDownloaded: this.bytesDownloaded,
      bytesTotal: total * 6.5 * 1024 * 1024, // Estimate; refined by network progress
      speed,
      timeElapsed: elapsed,
      timeRemaining: speed > 0 
        ? ((total - current) * 6.5 * 1024 * 1024) / speed * 1000
        : 0,
    };
    
    // Update session progress
    if (this.currentSession) {
      this.currentSession = DownloadManifest.updateProgress(
        this.currentSession,
        progress
      );
      DownloadManifest.save(this.currentSession);
    }
    
    // Call progress callback
    this.options.onProgress?.(progress);
  }
  
  /**
   * Get download statistics
   */
  getStatistics(): Record<string, unknown> | null {
    if (!this.currentSession) {
      return null;
    }
    
    return DownloadManifest.getStatistics(this.currentSession);
  }
  
  /**
   * Get resumable sessions
   */
  static getResumableSessions(): DownloadSession[] {
    return DownloadManifest.getResumableSessions();
  }
  
  /**
   * Clear download history
   */
  static clearHistory(): void {
    DownloadManifest.clearAll();
  }
}
