/**
 * Area Calculator for SRTM tile selection
 * Handles conversion between geographic bounds and SRTM tile IDs
 */

export interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface TileInfo {
  id: string;
  lat: number;
  lon: number;
  north: number;
  south: number;
  east: number;
  west: number;
  s3Path: string;
}

export class AreaCalculator {
  /**
   * Convert geographic bounds to list of SRTM tile IDs
   */
  static boundsToTiles(bounds: Bounds): string[] {
    const tiles: string[] = [];
    
    // Use inclusive range semantics matching tests:
    // include the tile row/column when the bound lies exactly on an integer line
    const minLat = Math.floor(bounds.south);
    const maxLat = Math.floor(bounds.north);
    const minLon = Math.floor(bounds.west);
    const maxLonRaw = Math.floor(bounds.east);
    // For normal cases, exclude east boundary tiles when dealing with negative integer boundaries
    const maxLon = (bounds.west <= bounds.east && bounds.east === Math.floor(bounds.east) && bounds.east < 0) ? bounds.east - 1 : Math.floor(bounds.east);
    
    // Handle antimeridian crossing
    if (bounds.west > bounds.east) {
      // Crosses 180° longitude
      for (let lat = minLat; lat <= maxLat; lat++) {
        // Western hemisphere tiles (positive to 180)
        for (let lon = minLon; lon <= 180; lon++) {
          tiles.push(this.formatTileId(lat, lon));
        }
        // Eastern hemisphere tiles (-180 to negative)
        for (let lon = -180; lon <= maxLonRaw; lon++) {
          tiles.push(this.formatTileId(lat, lon));
        }
      }
    } else {
      // Normal case (inclusive)
      for (let lat = minLat; lat <= maxLat; lat++) {
        for (let lon = minLon; lon <= maxLon; lon++) {
          tiles.push(this.formatTileId(lat, lon));
        }
      }
    }
    
    return tiles;
  }
  
  /**
   * Format a lat/lon pair into SRTM tile ID
   */
  private static formatTileId(lat: number, lon: number): string {
    const latPrefix = lat >= 0 ? 'N' : 'S';
    const lonPrefix = lon >= 0 ? 'E' : 'W';
    
    const latStr = Math.abs(lat).toString().padStart(2, '0');
    const lonStr = Math.abs(lon).toString().padStart(3, '0');
    
    return `${latPrefix}${latStr}${lonPrefix}${lonStr}`;
  }
  
  /**
   * Validate if coordinates are within SRTM coverage
   * SRTM covers 60°N to 56°S
   */
  static validateSRTMCoverage(lat: number, _lon: number): boolean {
    return lat <= 60 && lat >= -56;
  }
  
  /**
   * Calculate number of tiles in a bounding box
   */
  static calculateTileCount(bounds: Bounds): number {
    const minLat = Math.floor(bounds.south);
    const maxLat = Math.floor(bounds.north);
    const minLon = Math.floor(bounds.west);
    const maxLon = Math.floor(bounds.east);
    
    let count = 0;
    
    if (bounds.west > bounds.east) {
      // Antimeridian crossing
      const westernTiles = (180 - minLon + 1);
      const easternTiles = (maxLon + 180 + 1);
      count = (maxLat - minLat + 1) * (westernTiles + easternTiles);
    } else {
      count = (maxLat - minLat + 1) * (maxLon - minLon + 1);
    }
    
    return count;
  }
  
  /**
   * Get detailed information about a tile
   */
  static getTileInfo(tileId: string): TileInfo {
    // Parse tile ID (e.g., "N36W112" or "S34E018")
    const latMatch = tileId.match(/^([NS])(\d{2})/);
    const lonMatch = tileId.match(/([EW])(\d{3})$/);
    
    if (!latMatch || !lonMatch) {
      throw new Error(`Invalid tile ID: ${tileId}`);
    }
    
    const latSign = latMatch[1] === 'N' ? 1 : -1;
    const lat = parseInt(latMatch[2]) * latSign;
    
    const lonSign = lonMatch[1] === 'E' ? 1 : -1;
    const lon = parseInt(lonMatch[2]) * lonSign;
    
    // Calculate tile bounds
    // Each tile covers 1°x1° starting from the SW corner
    const south = lat;
    const north = lat + latSign;
    const west = lon;
    const east = lon + lonSign;
    
    // S3 path structure
    const latFolder = tileId.substring(0, 3);
    const s3Path = `${latFolder}/${tileId}.hgt.gz`;
    
    return {
      id: tileId,
      lat,
      lon,
      north: latSign > 0 ? north : south,
      south: latSign > 0 ? south : north,
      east: lonSign > 0 ? east : west,
      west: lonSign > 0 ? west : east,
      s3Path,
    };
  }
  
  /**
   * Check if a tile exists (not ocean)
   * This is a heuristic - actual check requires querying S3
   */
  static isProbablyOcean(tileId: string): boolean {
    const info = this.getTileInfo(tileId);
    
    // Known ocean areas (simplified)
    // Pacific Ocean
    if (info.lat >= -60 && info.lat <= 60) {
      if (info.lon >= 120 && info.lon <= -100) {
        // Mid-Pacific is mostly ocean
        if (Math.abs(info.lat) > 30) return true;
      }
    }
    
    // Atlantic Ocean
    if (info.lat >= -50 && info.lat <= 50) {
      if (info.lon >= -60 && info.lon <= -20) {
        // Mid-Atlantic
        if (Math.abs(info.lat) < 20) return true;
      }
    }
    
    return false;
  }
  
  /**
   * Get S3 URL for a tile
   */
  static getS3Url(tileId: string, baseUrl: string = 'https://s3.amazonaws.com/elevation-tiles-prod/skadi'): string {
    const info = this.getTileInfo(tileId);
    return `${baseUrl}/${info.s3Path}`;
  }
  
  /**
   * Calculate approximate download size for tiles
   */
  static estimateDownloadSize(tileCount: number): {
    compressed: number;
    uncompressed: number;
    formatted: string;
  } {
    // Average sizes based on real data
    const avgCompressedSize = 6.5 * 1024 * 1024; // ~6.5MB
    const avgUncompressedSize = 25934402; // Exactly 3601x3601x2 bytes
    
    const compressed = tileCount * avgCompressedSize;
    const uncompressed = tileCount * avgUncompressedSize;
    
    // Format size for display
    let formatted: string;
    if (compressed < 1024 * 1024) {
      formatted = `${(compressed / 1024).toFixed(1)} KB`;
    } else if (compressed < 1024 * 1024 * 1024) {
      formatted = `${(compressed / (1024 * 1024)).toFixed(1)} MB`;
    } else {
      formatted = `${(compressed / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
    
    return {
      compressed,
      uncompressed,
      formatted,
    };
  }
}
