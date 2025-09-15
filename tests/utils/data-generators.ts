/**
 * Test data generators for various data types
 */

import { testTiles } from '../fixtures/srtm-tiles';

export interface MockTileSelection {
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  tiles: string[];
  area: number;
  center: [number, number];
}

export interface MockDownloadSession {
  id: string;
  tiles: string[];
  completed: string[];
  failed: string[];
  progress: number;
  startTime: number;
  status: 'pending' | 'downloading' | 'completed' | 'failed';
}

/**
 * Generate a random tile ID
 */
export function generateTileId(
  lat?: number,
  lon?: number
): string {
  const latitude = lat ?? Math.floor(Math.random() * 180 - 90);
  const longitude = lon ?? Math.floor(Math.random() * 360 - 180);
  
  const latPrefix = latitude >= 0 ? 'N' : 'S';
  const lonPrefix = longitude >= 0 ? 'E' : 'W';
  
  const latStr = Math.abs(latitude).toString().padStart(2, '0');
  const lonStr = Math.abs(longitude).toString().padStart(3, '0');
  
  return `${latPrefix}${latStr}${lonPrefix}${lonStr}`;
}

/**
 * Generate a list of tile IDs for a bounding box
 */
export function generateTileList(
  bounds: { north: number; south: number; east: number; west: number }
): string[] {
  const tiles: string[] = [];
  
  for (let lat = Math.floor(bounds.south); lat <= Math.floor(bounds.north); lat++) {
    for (let lon = Math.floor(bounds.west); lon <= Math.floor(bounds.east); lon++) {
      tiles.push(generateTileId(lat, lon));
    }
  }
  
  return tiles;
}

/**
 * Generate a mock tile selection
 */
export function generateMockSelection(
  numTiles: number = 4
): MockTileSelection {
  // Generate a square selection
  const size = Math.ceil(Math.sqrt(numTiles));
  const centerLat = Math.floor(Math.random() * 140 - 70);
  const centerLon = Math.floor(Math.random() * 340 - 170);
  
  const bounds = {
    north: centerLat + size / 2,
    south: centerLat - size / 2,
    east: centerLon + size / 2,
    west: centerLon - size / 2,
  };
  
  return {
    bounds,
    tiles: generateTileList(bounds),
    area: (bounds.north - bounds.south) * (bounds.east - bounds.west),
    center: [centerLat, centerLon],
  };
}

/**
 * Generate a mock download session
 */
export function generateMockSession(
  tiles?: string[],
  percentComplete: number = 0
): MockDownloadSession {
  const tileList = tiles || generateTileList({
    north: 37,
    south: 35,
    east: -111,
    west: -113,
  });
  
  const numCompleted = Math.floor(tileList.length * percentComplete / 100);
  
  return {
    id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    tiles: tileList,
    completed: tileList.slice(0, numCompleted),
    failed: [],
    progress: percentComplete,
    startTime: Date.now() - (percentComplete * 1000),
    status: percentComplete === 100 ? 'completed' : 'downloading',
  };
}

/**
 * Generate mock cached tile data
 */
export function generateCachedTile(tileId: string) {
  return {
    id: tileId,
    data: new ArrayBuffer(25934402),
    compressed: false,
    timestamp: Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000, // Random time in last week
    size: 25934402,
    metadata: {
      minElevation: Math.floor(Math.random() * 1000),
      maxElevation: Math.floor(Math.random() * 3000 + 1000),
      source: 'AWS S3',
    },
  };
}

/**
 * Generate app settings
 */
export function generateMockSettings() {
  return {
    theme: Math.random() > 0.5 ? 'light' : 'dark',
    mapProvider: 'osm',
    maxConcurrentDownloads: 3,
    enableOfflineMode: true,
    cacheSize: 500 * 1024 * 1024, // 500MB
    autoRetry: true,
    retryAttempts: 3,
    compressionLevel: 6,
  };
}

/**
 * Generate a range of elevations for testing
 */
export function generateElevationData(
  width: number = 100,
  height: number = 100,
  pattern: 'flat' | 'hill' | 'valley' | 'random' = 'random'
): Int16Array {
  const data = new Int16Array(width * height);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      
      switch (pattern) {
        case 'flat':
          data[index] = 1000;
          break;
          
        case 'hill':
          const distFromCenter = Math.sqrt(
            Math.pow(x - width / 2, 2) + Math.pow(y - height / 2, 2)
          );
          data[index] = Math.max(0, 2000 - distFromCenter * 20);
          break;
          
        case 'valley':
          const distFromCenterValley = Math.sqrt(
            Math.pow(x - width / 2, 2) + Math.pow(y - height / 2, 2)
          );
          data[index] = Math.min(2000, distFromCenterValley * 20);
          break;
          
        case 'random':
        default:
          data[index] = Math.floor(Math.random() * 3000);
          break;
      }
    }
  }
  
  return data;
}

/**
 * Generate mock download progress events
 */
export function* generateProgressEvents(
  totalBytes: number,
  chunkSize: number = 1024 * 1024
): Generator<ProgressEvent> {
  let loaded = 0;
  
  while (loaded < totalBytes) {
    const chunk = Math.min(chunkSize, totalBytes - loaded);
    loaded += chunk;
    
    yield new ProgressEvent('progress', {
      loaded,
      total: totalBytes,
      lengthComputable: true,
    });
  }
}

/**
 * Generate a mock fetch response for testing
 */
export function generateMockResponse(
  data: ArrayBuffer | Uint8Array,
  options: {
    status?: number;
    headers?: Record<string, string>;
    delay?: number;
  } = {}
): Response {
  const blob = new Blob([data as BlobPart]);
  
  return new Response(blob, {
    status: options.status || 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': blob.size.toString(),
      ...options.headers,
    },
  });
}

/**
 * Generate test URLs for S3
 */
export function generateS3Urls(tiles: string[]): Map<string, string> {
  const urls = new Map<string, string>();
  const baseUrl = 'https://s3.amazonaws.com/elevation-tiles-prod/skadi';
  
  for (const tile of tiles) {
    const lat = tile.substring(0, 3);
    urls.set(tile, `${baseUrl}/${lat}/${tile}.hgt.gz`);
  }
  
  return urls;
}

/**
 * Generate a mock file for testing
 */
export function generateMockFile(
  name: string,
  size: number = 1024,
  type: string = 'application/octet-stream'
): File {
  const data = new Uint8Array(size);
  data.fill(0x42); // Fill with 'B'
  
  return new File([data], name, { type });
}

/**
 * Generate test cases for boundary conditions
 */
export function generateBoundaryTestCases(): Array<{
  name: string;
  bounds: { north: number; south: number; east: number; west: number };
  description: string;
}> {
  return [
    {
      name: 'Equator crossing',
      bounds: { north: 1, south: -1, east: 1, west: -1 },
      description: 'Selection crosses the equator',
    },
    {
      name: 'Prime meridian crossing',
      bounds: { north: 51, south: 50, east: 1, west: -1 },
      description: 'Selection crosses the prime meridian',
    },
    {
      name: 'Antimeridian crossing',
      bounds: { north: 35, south: 34, east: -179, west: 179 },
      description: 'Selection crosses the antimeridian (date line)',
    },
    {
      name: 'North pole region',
      bounds: { north: 60, south: 59, east: 10, west: 0 },
      description: 'Selection near the north pole (SRTM limit)',
    },
    {
      name: 'South pole region',
      bounds: { north: -55, south: -56, east: 10, west: 0 },
      description: 'Selection near the south pole (SRTM limit)',
    },
    {
      name: 'Single tile',
      bounds: { north: 36, south: 36, east: -112, west: -112 },
      description: 'Selection of a single tile',
    },
    {
      name: 'Large area',
      bounds: { north: 40, south: 30, east: -100, west: -110 },
      description: 'Large selection (100 tiles)',
    },
  ];
}