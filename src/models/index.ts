/**
 * Data models and interfaces for SRTM2TAK
 */

/**
 * SRTM Tile metadata
 */
export interface TileMetadata {
  id: string;                    // e.g., "N36W112"
  lat: number;                   // Center latitude
  lon: number;                   // Center longitude
  north: number;                 // Northern boundary
  south: number;                 // Southern boundary
  east: number;                  // Eastern boundary
  west: number;                  // Western boundary
  s3Url: string;                 // Full S3 URL
  s3Path: string;                // S3 path (e.g., "N36/N36W112.hgt.gz")
  exists?: boolean;              // Whether tile exists (not ocean)
  size?: number;                 // File size in bytes
  compressedSize?: number;       // Compressed size in bytes
  lastModified?: Date;           // Last modification date
  elevation?: {                  // Elevation statistics
    min: number;
    max: number;
    mean: number;
  };
}

/**
 * Area selection on map
 */
export interface AreaSelection {
  id: string;                    // Unique selection ID
  bounds: GeographicBounds;      // Geographic boundaries
  tiles: string[];               // List of tile IDs
  tileCount: number;             // Number of tiles
  area: number;                  // Area in square degrees
  estimatedSize: {               // Download size estimates
    compressed: number;
    uncompressed: number;
    formatted: string;
  };
  created: Date;                 // When selection was made
  name?: string;                 // Optional user-provided name
}

/**
 * Geographic bounds
 */
export interface GeographicBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/**
 * Cached tile in IndexedDB
 */
export interface CachedTile {
  id: string;                    // Tile ID
  data: ArrayBuffer;             // Tile data (compressed or uncompressed)
  size: number;                  // Size in bytes
  originalSize?: number;         // Original size if compressed
  compressed: boolean;           // Whether data is compressed
  timestamp: number;             // When cached
  lastAccessed: number;          // Last access time
  metadata?: TileMetadata;       // Optional metadata
  source: 'download' | 'import'; // How tile was obtained
}

/**
 * Download session
 */
export interface DownloadSession {
  id: string;                    // Session ID
  selection: AreaSelection;      // What was selected
  tiles: string[];               // All tiles to download
  completed: string[];           // Successfully downloaded
  failed: string[];              // Failed downloads
  skipped: string[];             // Skipped (already cached)
  status: DownloadStatus;        // Current status
  progress: DownloadProgress;    // Progress information
  startTime: number;             // Start timestamp
  endTime?: number;              // End timestamp
  error?: string;                // Error message if failed
  resumable: boolean;            // Can be resumed
  outputFormat: 'zip' | 'folder'; // Output format
}

/**
 * Download status
 */
export type DownloadStatus = 
  | 'pending'
  | 'downloading'
  | 'processing'
  | 'packaging'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'paused';

/**
 * Download progress
 */
export interface DownloadProgress {
  current: number;               // Current tile index
  total: number;                 // Total tiles
  percent: number;               // Percentage (0-100)
  bytesDownloaded: number;       // Bytes downloaded
  bytesTotal: number;            // Total bytes expected
  speed: number;                 // Bytes per second
  timeElapsed: number;           // Milliseconds elapsed
  timeRemaining: number;         // Estimated milliseconds remaining
  currentTile?: string;          // Currently downloading tile
}

/**
 * Application settings
 */
export interface AppSettings {
  // Display
  theme: 'light' | 'dark' | 'auto';
  mapProvider: 'osm' | 'mapbox' | 'google';
  mapStyle?: string;
  showTileGrid: boolean;
  showTileLabels: boolean;
  
  // Performance
  maxConcurrentDownloads: number;
  downloadTimeout: number;        // Milliseconds
  retryAttempts: number;
  retryDelay: number;            // Milliseconds
  
  // Storage
  enableCache: boolean;
  maxCacheSize: number;          // Bytes
  cacheExpiration: number;       // Days
  autoEviction: boolean;
  
  // Memory
  enableMemoryMonitoring: boolean;
  memoryWarningThreshold: number; // Percentage (0-1)
  memoryCriticalThreshold: number; // Percentage (0-1)
  
  // Compression
  compressionLevel: number;      // 0-9 (0 = store, 9 = max compression)
  compressCache: boolean;        // Compress tiles in cache
  
  // Export
  includeReadme: boolean;        // Include README in ZIP
  includeManifest: boolean;      // Include manifest.json
  zipComment?: string;           // Custom ZIP comment
  
  // Advanced
  enableOfflineMode: boolean;
  enableAnalytics: boolean;
  debugMode: boolean;
  customS3Endpoint?: string;
}

/**
 * Device information
 */
export interface DeviceInfo {
  platform: string;
  browser: string;
  version: string;
  isMobile: boolean;
  isTablet: boolean;
  screen: {
    width: number;
    height: number;
    pixelRatio: number;
  };
  memory?: {
    limit: number;
    used: number;
    available: number;
  };
  storage?: {
    quota: number;
    usage: number;
    persistent: boolean;
  };
  connection?: {
    type: string;
    downlink: number;
    rtt: number;
  };
}

/**
 * Error information
 */
export interface ErrorInfo {
  code: string;
  message: string;
  details?: any;
  timestamp: Date;
  context?: string;
  stack?: string;
  recoverable: boolean;
}

/**
 * Export options
 */
export interface ExportOptions {
  format: 'zip' | 'tar' | 'folder';
  compression: boolean;
  compressionLevel?: number;
  includeMetadata: boolean;
  splitSize?: number;            // Split into multiple files if size exceeds
  password?: string;              // Optional password protection
}

/**
 * Import options
 */
export interface ImportOptions {
  source: 'file' | 'url' | 'directory';
  overwriteExisting: boolean;
  validateData: boolean;
  extractArchive: boolean;
}

/**
 * Tile statistics
 */
export interface TileStatistics {
  tileId: string;
  fileSize: number;
  compressedSize: number;
  compressionRatio: number;
  elevationRange: {
    min: number;
    max: number;
    mean: number;
  };
  voidPixels: number;
  validPixels: number;
  coverage: number;              // Percentage of valid data
}

/**
 * Map view state
 */
export interface MapViewState {
  center: [number, number];      // [lat, lon]
  zoom: number;
  bounds?: GeographicBounds;
  selection?: GeographicBounds;
  visibleTiles: string[];
  cachedTiles: string[];
  downloadedTiles: string[];
}

/**
 * Notification
 */
export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: Date;
  duration?: number;             // Auto-dismiss after milliseconds
  action?: {
    label: string;
    callback: () => void;
  };
}

/**
 * Task for background processing
 */
export interface BackgroundTask {
  id: string;
  type: 'download' | 'process' | 'export' | 'import';
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  data: any;
  created: Date;
  started?: Date;
  completed?: Date;
  error?: ErrorInfo;
}

/**
 * User preferences (persisted)
 */
export interface UserPreferences {
  userId?: string;
  settings: Partial<AppSettings>;
  recentSelections: AreaSelection[];
  favoriteAreas: AreaSelection[];
  downloadHistory: DownloadSession[];
  lastUsed: Date;
  totalDownloaded: number;
  totalSessions: number;
}