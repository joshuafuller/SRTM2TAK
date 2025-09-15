/**
 * Tile Fetcher for downloading SRTM tiles from S3
 * Handles retries, progress tracking, and concurrent downloads
 */

export interface TileFetcherOptions {
  baseUrl?: string;
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
  onProgress?: (progress: ProgressInfo) => void;
}

export interface ProgressInfo {
  tileId: string;
  loaded: number;
  total: number;
  percent: number;
}

export interface FetchResult {
  tileId: string;
  success: boolean;
  data?: ArrayBuffer;
  error?: Error;
  downloaded?: boolean;
  skipped?: boolean;
}

export interface DownloadManifest {
  sessionId: string;
  tiles: string[];
  completed: string[];
  failed: string[];
  timestamp: number;
}

export class TileFetcher {
  private baseUrl: string;
  private maxRetries: number;
  private retryDelay: number;
  private timeout: number;
  private onProgress?: (progress: ProgressInfo) => void;
  
  constructor(options: TileFetcherOptions = {}) {
    this.baseUrl = options.baseUrl || 'https://s3.amazonaws.com/elevation-tiles-prod/skadi';
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.timeout = options.timeout || 30000;
    this.onProgress = options.onProgress;
  }
  
  /**
   * Fetch a single tile from S3
   */
  async fetch(tileId: string, externalSignal?: AbortSignal): Promise<ArrayBuffer | null> {
    const url = this.buildUrl(tileId);
    let lastError: Error | undefined;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        // Relay external aborts into our local controller
        const onAbort = () => controller.abort();
        if (externalSignal) {
          if (externalSignal.aborted) controller.abort();
          else externalSignal.addEventListener('abort', onAbort, { once: true });
        }
        
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'Accept': 'application/gzip',
          },
        });
        
        clearTimeout(timeoutId);
        if (externalSignal) externalSignal.removeEventListener('abort', onAbort);
        
        if (response.status === 404) {
          // Ocean tile or missing data
          return null;
        }
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        // Get content length for progress tracking
        const contentLength = response.headers.get('content-length');
        const total = contentLength ? parseInt(contentLength) : 0;
        
        if (!response.body) {
          throw new Error('Response body is null');
        }
        
        // Read response with progress tracking
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let loaded = 0;
        
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) break;
          
          chunks.push(value);
          loaded += value.length;
          
          if (this.onProgress && total > 0) {
            this.onProgress({
              tileId,
              loaded,
              total,
              percent: Math.round((loaded / total) * 100),
            });
          }
        }
        
        // Combine chunks into single ArrayBuffer
        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const result = new Uint8Array(totalLength);
        let position = 0;
        
        for (const chunk of chunks) {
          result.set(chunk, position);
          position += chunk.length;
        }
        
        return result.buffer;
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (error instanceof Error && error.name === 'AbortError') {
          lastError = new Error(`Timeout after ${this.timeout}ms`);
        }
        
        if (attempt < this.maxRetries) {
          // Wait before retry with exponential backoff
          await new Promise(resolve => 
            setTimeout(resolve, this.retryDelay * Math.pow(2, attempt - 1))
          );
        }
      }
    }
    
    throw lastError || new Error('Failed to fetch tile');
  }
  
  /**
   * Fetch multiple tiles with concurrency control
   */
  async fetchMultiple(
    tiles: string[],
    options: { concurrent?: number } = {}
  ): Promise<FetchResult[]> {
    const concurrent = options.concurrent || 3;
    const results: FetchResult[] = [];
    const queue = [...tiles];
    const inProgress = new Set<Promise<void>>();
    
    while (queue.length > 0 || inProgress.size > 0) {
      // Start new downloads up to concurrency limit
      while (queue.length > 0 && inProgress.size < concurrent) {
        const tileId = queue.shift()!;
        
        const promise = this.fetch(tileId)
          .then(data => {
            results.push({
              tileId,
              success: true,
              data: data || undefined,
              downloaded: true,
            });
          })
          .catch(error => {
            results.push({
              tileId,
              success: false,
              error: error instanceof Error ? error : new Error(String(error)),
              downloaded: false,
            });
          })
          .finally(() => {
            inProgress.delete(promise);
          });
        
        inProgress.add(promise);
      }
      
      // Wait for at least one to complete
      if (inProgress.size > 0) {
        await Promise.race(inProgress);
      }
    }
    
    return results;
  }
  
  /**
   * Check if a tile exists using HEAD request
   */
  async checkTileExists(tileId: string): Promise<boolean> {
    const url = this.buildUrl(tileId);
    
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      });
      
      return response.ok;
    } catch {
      return false;
    }
  }
  
  /**
   * Resume download from a saved manifest
   */
  async resumeFromManifest(manifest: DownloadManifest): Promise<FetchResult[]> {
    const results: FetchResult[] = [];
    
    // Mark completed tiles as skipped
    for (const tileId of manifest.completed) {
      results.push({
        tileId,
        success: true,
        skipped: true,
        downloaded: false,
      });
    }
    
    // Download remaining tiles
    const remaining = manifest.tiles.filter(
      tile => !manifest.completed.includes(tile) && !manifest.failed.includes(tile)
    );
    
    if (remaining.length > 0) {
      const downloadResults = await this.fetchMultiple(remaining);
      results.push(...downloadResults);
    }
    
    // Include previously failed tiles for retry
    if (manifest.failed.length > 0) {
      const retryResults = await this.fetchMultiple(manifest.failed);
      results.push(...retryResults);
    }
    
    return results;
  }
  
  /**
   * Build S3 URL for a tile
   */
  private buildUrl(tileId: string): string {
    // Extract latitude folder (first 3 characters)
    const latFolder = tileId.substring(0, 3);
    return `${this.baseUrl}/${latFolder}/${tileId}.hgt.gz`;
  }
  
  /**
   * Create a download manifest for resume capability
   */
  static createManifest(
    tiles: string[],
    sessionId?: string
  ): DownloadManifest {
    return {
      sessionId: sessionId || `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      tiles,
      completed: [],
      failed: [],
      timestamp: Date.now(),
    };
  }
  
  /**
   * Update manifest with download results
   */
  static updateManifest(
    manifest: DownloadManifest,
    results: FetchResult[]
  ): DownloadManifest {
    const updated = { ...manifest };
    
    for (const result of results) {
      if (result.success && !result.skipped) {
        if (!updated.completed.includes(result.tileId)) {
          updated.completed.push(result.tileId);
        }
        // Remove from failed if it was there
        updated.failed = updated.failed.filter(id => id !== result.tileId);
      } else if (!result.success && !result.skipped) {
        if (!updated.failed.includes(result.tileId)) {
          updated.failed.push(result.tileId);
        }
      }
    }
    
    return updated;
  }
}
