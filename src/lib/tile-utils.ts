/**
 * Tile naming and utility functions for SRTM tiles
 */

/**
 * Convert latitude/longitude to SRTM tile ID
 * @param lat Latitude (-56 to 60)
 * @param lon Longitude (-180 to 180)
 * @returns Tile ID like "N36W112" or "S34E018"
 */
export function latLonToTileId(lat: number, lon: number): string {
  // Floor to get the tile's SW corner
  const tileLat = Math.floor(lat);
  const tileLon = Math.floor(lon);
  
  // Determine hemisphere prefixes
  const latPrefix = tileLat >= 0 ? 'N' : 'S';
  const lonPrefix = tileLon >= 0 ? 'E' : 'W';
  
  // Format with zero padding
  const latStr = Math.abs(tileLat).toString().padStart(2, '0');
  const lonStr = Math.abs(tileLon).toString().padStart(3, '0');
  
  return `${latPrefix}${latStr}${lonPrefix}${lonStr}`;
}

/**
 * Parse tile ID to get coordinates
 * @param tileId Tile ID like "N36W112"
 * @returns Object with lat/lon or null if invalid
 */
export function parseTileId(tileId: string): { lat: number; lon: number } | null {
  const match = tileId.match(/^([NS])(\d{2})([EW])(\d{3})$/);
  
  if (!match) {
    return null;
  }
  
  const [, latDir, latVal, lonDir, lonVal] = match;
  
  const lat = parseInt(latVal) * (latDir === 'N' ? 1 : -1);
  const lon = parseInt(lonVal) * (lonDir === 'E' ? 1 : -1);
  
  return { lat, lon };
}

/**
 * Get tile bounds from tile ID
 * @param tileId Tile ID like "N36W112"
 * @returns Bounds object or null if invalid
 */
export function getTileBounds(tileId: string): {
  north: number;
  south: number;
  east: number;
  west: number;
} | null {
  const coords = parseTileId(tileId);
  
  if (!coords) {
    return null;
  }
  
  const { lat, lon } = coords;
  
  // Each tile covers 1°x1° from its SW corner
  return {
    south: lat,
    north: lat + 1,
    west: lon,
    east: lon + 1,
  };
}

/**
 * Build S3 URL for a tile
 * @param tileId Tile ID like "N36W112"
 * @param baseUrl Optional base URL (defaults to AWS)
 * @returns Full S3 URL
 */
export function buildS3Url(
  tileId: string,
  baseUrl: string = 'https://s3.amazonaws.com/elevation-tiles-prod/skadi'
): string {
  // Extract latitude folder (first 3 characters)
  const latFolder = tileId.substring(0, 3);
  return `${baseUrl}/${latFolder}/${tileId}.hgt.gz`;
}

/**
 * Get S3 path for a tile (without base URL)
 * @param tileId Tile ID like "N36W112"
 * @returns S3 path like "N36/N36W112.hgt.gz"
 */
export function getS3Path(tileId: string): string {
  const latFolder = tileId.substring(0, 3);
  return `${latFolder}/${tileId}.hgt.gz`;
}

/**
 * Get neighboring tiles
 * @param tileId Center tile ID
 * @returns Array of 8 neighboring tile IDs
 */
export function getNeighboringTiles(tileId: string): string[] {
  const coords = parseTileId(tileId);
  
  if (!coords) {
    return [];
  }
  
  const { lat, lon } = coords;
  const neighbors: string[] = [];
  
  // 8 surrounding tiles
  for (let dlat = -1; dlat <= 1; dlat++) {
    for (let dlon = -1; dlon <= 1; dlon++) {
      if (dlat === 0 && dlon === 0) continue; // Skip center
      
      const neighborLat = lat + dlat;
      const neighborLon = lon + dlon;
      
      // Check if within SRTM coverage
      if (neighborLat >= -56 && neighborLat <= 60) {
        // Handle longitude wrap-around
        let wrappedLon = neighborLon;
        if (wrappedLon > 180) wrappedLon -= 360;
        if (wrappedLon < -180) wrappedLon += 360;
        
        neighbors.push(latLonToTileId(neighborLat, wrappedLon));
      }
    }
  }
  
  return neighbors;
}

/**
 * Calculate distance between two tiles (in degrees)
 * @param tileId1 First tile ID
 * @param tileId2 Second tile ID
 * @returns Distance in degrees or null if invalid
 */
export function tileDistance(tileId1: string, tileId2: string): number | null {
  const coords1 = parseTileId(tileId1);
  const coords2 = parseTileId(tileId2);
  
  if (!coords1 || !coords2) {
    return null;
  }
  
  const dlat = coords2.lat - coords1.lat;
  const dlon = coords2.lon - coords1.lon;
  
  return Math.sqrt(dlat * dlat + dlon * dlon);
}

/**
 * Check if tile is within SRTM coverage
 * @param tileId Tile ID to check
 * @returns true if within coverage
 */
export function isWithinCoverage(tileId: string): boolean {
  const coords = parseTileId(tileId);
  
  if (!coords) {
    return false;
  }
  
  // SRTM covers 60°N to 56°S
  return coords.lat >= -56 && coords.lat <= 60;
}

/**
 * Format tile ID for display
 * @param tileId Tile ID like "N36W112"
 * @returns Formatted string like "36°N 112°W"
 */
export function formatTileId(tileId: string): string {
  const coords = parseTileId(tileId);
  
  if (!coords) {
    return tileId;
  }
  
  const latStr = `${Math.abs(coords.lat)}°${coords.lat >= 0 ? 'N' : 'S'}`;
  const lonStr = `${Math.abs(coords.lon)}°${coords.lon >= 0 ? 'E' : 'W'}`;
  
  return `${latStr} ${lonStr}`;
}

/**
 * Get tile filename (without path)
 * @param tileId Tile ID
 * @param compressed Whether to include .gz extension
 * @returns Filename like "N36W112.hgt" or "N36W112.hgt.gz"
 */
export function getTileFilename(tileId: string, compressed: boolean = false): string {
  return compressed ? `${tileId}.hgt.gz` : `${tileId}.hgt`;
}

/**
 * Estimate file sizes for tiles
 * @param tileCount Number of tiles
 * @returns Size estimates
 */
export function estimateFileSizes(tileCount: number): {
  compressed: number;
  uncompressed: number;
  compressedFormatted: string;
  uncompressedFormatted: string;
} {
  // Based on real SRTM data
  const UNCOMPRESSED_SIZE = 25934402; // Exactly 3601x3601x2 bytes
  const AVG_COMPRESSED_SIZE = 6.5 * 1024 * 1024; // ~6.5MB average
  
  const compressed = tileCount * AVG_COMPRESSED_SIZE;
  const uncompressed = tileCount * UNCOMPRESSED_SIZE;
  
  return {
    compressed,
    uncompressed,
    compressedFormatted: formatBytes(compressed),
    uncompressedFormatted: formatBytes(uncompressed),
  };
}

/**
 * Format bytes to human-readable string
 * @param bytes Number of bytes
 * @returns Formatted string like "25.9 MB"
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Sort tiles by geographic order (NW to SE)
 * @param tileIds Array of tile IDs
 * @returns Sorted array
 */
export function sortTilesGeographically(tileIds: string[]): string[] {
  return tileIds.sort((a, b) => {
    const coordsA = parseTileId(a);
    const coordsB = parseTileId(b);
    
    if (!coordsA || !coordsB) return 0;
    
    // Sort by latitude (north to south)
    if (coordsA.lat !== coordsB.lat) {
      return coordsB.lat - coordsA.lat;
    }
    
    // Then by longitude (west to east)
    return coordsA.lon - coordsB.lon;
  });
}

/**
 * Group tiles by latitude band
 * @param tileIds Array of tile IDs
 * @returns Map of latitude to tile IDs
 */
export function groupTilesByLatitude(tileIds: string[]): Map<number, string[]> {
  const groups = new Map<number, string[]>();
  
  for (const tileId of tileIds) {
    const coords = parseTileId(tileId);
    if (coords) {
      const existing = groups.get(coords.lat) || [];
      existing.push(tileId);
      groups.set(coords.lat, existing);
    }
  }
  
  return groups;
}

/**
 * Calculate bounding box for multiple tiles
 * @param tileIds Array of tile IDs
 * @returns Bounding box or null if no valid tiles
 */
export function calculateBoundingBox(tileIds: string[]): {
  north: number;
  south: number;
  east: number;
  west: number;
} | null {
  if (tileIds.length === 0) return null;
  
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  
  for (const tileId of tileIds) {
    const bounds = getTileBounds(tileId);
    if (bounds) {
      minLat = Math.min(minLat, bounds.south);
      maxLat = Math.max(maxLat, bounds.north);
      minLon = Math.min(minLon, bounds.west);
      maxLon = Math.max(maxLon, bounds.east);
    }
  }
  
  if (!isFinite(minLat)) return null;
  
  return {
    north: maxLat,
    south: minLat,
    east: maxLon,
    west: minLon,
  };
}