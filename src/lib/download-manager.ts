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

/**
 * DownloadManager - Handles concurrent tile downloads with progress tracking
 *
 * Progress Tracking Architecture:
 * - handleNetworkProgress: Tracks bytes downloaded for speed/bandwidth (does NOT emit progress)
 * - updateProgress: Single source of truth for progress events (emits to UI)
 * - tilesCompleted/tilesTotal: Authoritative counters for progress calculation
 */
export class DownloadManager {
  private fetcher: TileFetcher;
  private storage: StorageManager;
  private monitor: MemoryMonitor;
  private streamZip: StreamZip;
  private currentSession: DownloadSession | null = null;
  private abortController: AbortController | null = null;
  private downloadStartTime: number = 0;
  private cacheStats = {
    hits: 0,
    misses: 0,
    errors: 0,
    writeErrors: 0
  };
  private bytesDownloaded: number = 0;
  private totalEstimatedBytes: number = 0;
  private tileBytesLoaded: Map<string, number> = new Map();
  private actualTotalBytes: number = 0;
  private tilesFromCache: number = 0;
  private tilesFromNetwork: number = 0;
  private lastProgressUpdate: number = 0;
  private tilesCompleted: number = 0;
  private tilesTotal: number = 0;
  
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
    this.actualTotalBytes = 0;
    this.tilesFromCache = 0;
    this.tilesFromNetwork = 0;
    this.tilesCompleted = 0;
    this.tilesTotal = tileIds.length;
    this.lastProgressUpdate = Date.now();
    // Estimate total compressed size for progress (will be refined with actual data)
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
   * This ONLY tracks bytes for bandwidth/speed calculations
   * Does NOT emit progress events - that's handled by updateProgress
   */
  private handleNetworkProgress(p: { tileId: string; loaded: number; total: number }): void {
    const prev = this.tileBytesLoaded.get(p.tileId) || 0;
    const delta = Math.max(0, p.loaded - prev);
    if (delta > 0) {
      this.bytesDownloaded += delta;
      this.tileBytesLoaded.set(p.tileId, p.loaded);
    }

    // Update actual total bytes if we have a real total from the network
    if (p.total > 0 && !this.tileBytesLoaded.has(p.tileId + '_total')) {
      this.tileBytesLoaded.set(p.tileId + '_total', p.total);
      this.actualTotalBytes += p.total;
    }

    // Only emit fine-grained progress during active downloads, throttled
    const now = Date.now();
    if (now - this.lastProgressUpdate >= 100 && this.options.onProgress) {
      this.lastProgressUpdate = now;
      // Call the central updateProgress method to emit progress
      this.updateProgress(this.tilesCompleted, this.tilesTotal);
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
   * Common concurrency pool manager for async iterators
   */
  private async *manageConcurrentPool<T>(
    items: string[],
    processor: (item: string) => Promise<T | null>,
    shouldYield: (result: T | null) => boolean
  ): AsyncGenerator<T> {
    const total = items.length;
    let completed = 0;
    // Validate and clamp concurrency to safe range
    const requestedConcurrency = this.options.concurrentDownloads ?? 3;
    const concurrency = Math.max(1, Math.min(10, requestedConcurrency));

    type WrappedResult = { promise: Promise<WrappedResult>; result: T | null };
    const inFlight = new Set<Promise<WrappedResult>>();
    let index = 0;

    const launchNext = (): void => {
      if (index >= items.length) return;
      const item = items[index++];
      // Create self-referencing promise to track completion
      let promiseRef: Promise<WrappedResult> = null as any;
      promiseRef = processor(item)
        .then(result => ({ promise: promiseRef, result }))
        .catch((err) => {
          console.error(`Failed to process item ${item}:`, err);
          return { promise: promiseRef, result: null };
        });
      inFlight.add(promiseRef);
    };

    // Fill initial pool
    while (inFlight.size < concurrency && index < items.length) {
      launchNext();
    }

    // Process results
    while (inFlight.size > 0) {
      if (this.abortController?.signal.aborted) {
        throw new DOMException('Download cancelled', 'AbortError');
      }
      const { promise, result } = await Promise.race(inFlight);
      inFlight.delete(promise);

      // Keep pool full
      while (inFlight.size < concurrency && index < items.length) {
        launchNext();
      }

      completed++;
      this.tilesCompleted = completed;
      this.updateProgress(completed, total);
      if (shouldYield(result)) {
        yield result as T;
      }
    }
  }

  /**
   * Create async iterator for tiles
   */
  private async *createTileIterator(
    tileIds: string[]
  ): AsyncGenerator<{ id: string; data: ArrayBuffer }> {
    yield* this.manageConcurrentPool(
      tileIds,
      (tileId) => this.processTile(tileId),
      (result) => result !== null && result.data.byteLength > 0
    );
  }

  /**
   * Unified async iterator that yields all tiles (cached or network) honoring concurrency
   */
  private async *createUnifiedIterator(
    tileIds: string[]
  ): AsyncGenerator<{ id: string; data: ArrayBuffer }> {
    yield* this.manageConcurrentPool(
      tileIds,
      (tileId) => this.processUnifiedTile(tileId),
      (result) => result !== null && result.data.byteLength > 0
    );
  }

  private async processUnifiedTile(tileId: string): Promise<{ id: string; data: ArrayBuffer }> {
    // cancellation & memory checks
    if (this.abortController?.signal.aborted) throw new DOMException('Download cancelled', 'AbortError');
    const mem = this.monitor.getMemoryStatus();
    if (mem.level === 'critical') throw new Error('Out of memory');
    if (mem.level === 'warning') await new Promise((r) => setTimeout(r, 300));

    let data: ArrayBuffer | null = null;
    let cacheAttempted = false;
    // Try cache first if enabled
    if (this.options.useCache !== false && this.storage.isInitialized()) {
      cacheAttempted = true;
      try {
        const entry = await this.storage.get(tileId);
        if (entry && entry.data && entry.data.byteLength > 0) {
          data = entry.data;
          this.cacheStats.hits++;
          this.tilesFromCache++;
        } else {
          this.cacheStats.misses++;
        }
      } catch (error) {
        console.debug(`Cache read error for tile ${tileId}:`, error);
        this.cacheStats.errors++;
        // Continue without cache for this tile
      }
    }
    if (!data) {
      if (!cacheAttempted) {
        this.cacheStats.misses++;
      }
      this.options.onTileStart?.(tileId);
      data = await this.downloadTile(tileId);
      if (data && data.byteLength > 0) {
        this.tilesFromNetwork++;
      }
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
        } catch (error) {
          console.debug(`Cache write error for tile ${tileId}:`, error);
          this.cacheStats.writeErrors++;
          // Continue without caching this tile
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
          this.cacheStats.hits++;
          if (this.currentSession) {
            // Treat cached tiles as completed, since they will be included in the ZIP
            this.currentSession = DownloadManifest.markTileCompleted(this.currentSession, tileId);
          }
        } else {
          this.cacheStats.misses++;
        }
      } catch (e) {
        console.debug(`Cache read error for ${tileId}, proceeding to download:`, e);
        this.cacheStats.errors++;
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
            console.debug(`Failed to cache tile ${tileId}:`, e);
            this.cacheStats.writeErrors++;
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
    } catch (error) {
      console.debug('Storage initialization error in getCachedTiles:', error);
      return cached;
    }
    if (!this.storage.isInitialized()) return cached;

    for (const id of tileIds) {
      try {
        const entry = await this.storage.get(id);
        if (entry && entry.data && entry.size > 0) {
          cached.add(id);
        }
      } catch (error) {
        console.debug(`Cache check error for tile ${id}:`, error);
        // Continue checking other tiles
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
    // Update instance variables to keep them in sync
    this.tilesCompleted = current;
    this.tilesTotal = total;

    const now = Date.now();
    const elapsed = now - this.downloadStartTime;

    // Calculate effective speed based on actual downloads (not cache hits)
    const effectiveBytesDownloaded = this.bytesDownloaded;
    const effectiveSpeed = elapsed > 0 ? effectiveBytesDownloaded / (elapsed / 1000) : 0;

    // Calculate more accurate total bytes estimate
    const avgBytesPerTile = this.tilesFromNetwork > 0 ?
      this.bytesDownloaded / this.tilesFromNetwork :
      6.5 * 1024 * 1024;

    // Account for cached tiles in total estimate
    const remainingNetworkTiles = Math.max(0, total - current);
    const estimatedRemainingBytes = remainingNetworkTiles * avgBytesPerTile;
    const refinedTotalBytes = this.bytesDownloaded + estimatedRemainingBytes;

    const progress: DownloadProgress = {
      current: this.tilesCompleted,
      total: this.tilesTotal,
      percent: Math.round((this.tilesCompleted / this.tilesTotal) * 100),
      bytesDownloaded: this.bytesDownloaded,
      bytesTotal: refinedTotalBytes,
      speed: effectiveSpeed,
      timeElapsed: elapsed,
      timeRemaining: effectiveSpeed > 0 && estimatedRemainingBytes > 0
        ? Math.max(0, Math.round((estimatedRemainingBytes / effectiveSpeed) * 1000))
        : 0,
      tilesFromCache: this.tilesFromCache,
      tilesFromNetwork: this.tilesFromNetwork,
      averageTileSize: this.tilesFromNetwork > 0 ? Math.round(this.bytesDownloaded / this.tilesFromNetwork) : 0,
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
    const baseStats = {
      cache: this.cacheStats,
      tilesFromCache: this.tilesFromCache,
      tilesFromNetwork: this.tilesFromNetwork,
      bytesDownloaded: this.bytesDownloaded,
      averageTileSize: this.tilesFromNetwork > 0 ?
        Math.round(this.bytesDownloaded / this.tilesFromNetwork) : 0,
      actualVsEstimated: this.actualTotalBytes > 0 ?
        Math.round((this.actualTotalBytes / this.totalEstimatedBytes) * 100) : 100,
    };

    if (!this.currentSession) {
      return baseStats;
    }

    const stats = DownloadManifest.getStatistics(this.currentSession);
    return {
      ...stats,
      ...baseStats
    };
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
