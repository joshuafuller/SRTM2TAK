/**
 * Clean Selection System - Area-based, not tile-based
 * 
 * Core principle: Users select AREAS, system computes TILES
 */

import { getTileFriendlyName, formatDownloadName, TileInfo } from './smart-tile-naming';

// Domain Types
export interface BoundingBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface TileId {
  id: string; // e.g., "N38W105"
  lat: number;
  lon: number;
}

export interface SelectionState {
  // User's selection
  selectedArea: BoundingBox | null;
  
  // Computed from selection
  requiredTiles: TileId[];
  tilesWithNames: TileInfo[]; // Tiles with friendly names
  cachedTiles: Set<string>;
  newTiles: Set<string>;
  
  // Derived metrics
  totalTiles: number;
  downloadSize: number; // in bytes
  areaSquareKm: number;
  friendlyDescription: string; // e.g., "Denver Area, Colorado"
}

// Pure Functions - Testable Core Logic

/**
 * Convert a bounding box to the list of SRTM tiles it covers
 * SRTM tiles are 1°×1° and named by their SW corner
 */
export function boundingBoxToTiles(bounds: BoundingBox): TileId[] {
  const tiles: TileId[] = [];
  
  // Validate bounds
  if (!bounds || bounds.north <= bounds.south) {
    return tiles;
  }

  // For longitude, allow antimeridian crossing (east < west is valid)
  
  // SRTM coverage: -56° to +60° latitude
  const minLat = Math.max(Math.floor(bounds.south), -56);
  const maxLat = Math.min(Math.floor(bounds.north), 59);
  
  // Handle longitude (wraps at ±180)
  const minLon = Math.floor(bounds.west);
  const maxLon = Math.floor(bounds.east);

  // Generate tiles
  if (bounds.west > bounds.east) {
    // Antimeridian crossing case
    for (let lat = minLat; lat <= maxLat; lat++) {
      // Western hemisphere tiles (positive to 180)
      for (let lon = minLon; lon <= 180; lon++) {
        tiles.push({
          id: formatTileId(lat, lon),
          lat,
          lon
        });
      }
      // Eastern hemisphere tiles (-180 to negative)
      for (let lon = -180; lon <= maxLon; lon++) {
        tiles.push({
          id: formatTileId(lat, lon),
          lat,
          lon
        });
      }
    }
  } else {
    // Normal case
    for (let lat = minLat; lat <= maxLat; lat++) {
      for (let lon = minLon; lon <= maxLon; lon++) {
        tiles.push({
          id: formatTileId(lat, lon),
          lat,
          lon
        });
      }
    }
  }
  
  return tiles;
}

/**
 * Format a tile ID from coordinates
 */
export function formatTileId(lat: number, lon: number): string {
  const latHemi = lat >= 0 ? 'N' : 'S';
  const lonHemi = lon >= 0 ? 'E' : 'W';
  const latStr = Math.abs(lat).toString().padStart(2, '0');
  const lonStr = Math.abs(lon).toString().padStart(3, '0');
  return `${latHemi}${latStr}${lonHemi}${lonStr}`;
}

/**
 * Calculate area of bounding box in square kilometers
 */
export function calculateAreaKm2(bounds: BoundingBox): number {
  if (!bounds) return 0;
  
  const R = 6371; // Earth radius in km
  const dLat = (bounds.north - bounds.south) * Math.PI / 180;
  const dLon = (bounds.east - bounds.west) * Math.PI / 180;
  
  // Approximate area (good enough for our use case)
  const avgLat = (bounds.north + bounds.south) / 2 * Math.PI / 180;
  const area = R * R * dLat * dLon * Math.cos(avgLat);
  
  return Math.abs(area);
}

/**
 * Calculate download size for tiles
 * SRTM1 tiles are ~25MB each when compressed
 */
export function calculateDownloadSize(tileCount: number): number {
  const COMPRESSED_TILE_SIZE = 6.5 * 1024 * 1024; // ~6.5MB gzipped
  return tileCount * COMPRESSED_TILE_SIZE;
}

/**
 * Observable Selection Store - Single Source of Truth
 */
export class SelectionStore {
  private state: SelectionState = {
    selectedArea: null,
    requiredTiles: [],
    tilesWithNames: [],
    cachedTiles: new Set(),
    newTiles: new Set(),
    totalTiles: 0,
    downloadSize: 0,
    areaSquareKm: 0,
    friendlyDescription: ''
  };
  
  private listeners = new Set<(state: SelectionState) => void>();
  private cachedTileIds = new Set<string>();
  
  constructor(cachedTiles: string[] = []) {
    this.cachedTileIds = new Set(cachedTiles);
  }
  
  /**
   * Select an area on the map (replaces previous selection)
   */
  selectArea(bounds: BoundingBox): void {
    // Compute required tiles
    const tiles = boundingBoxToTiles(bounds);
    const tileIds = new Set(tiles.map(t => t.id));
    
    // Get friendly names for all tiles
    const tilesWithNames = tiles.map(t => getTileFriendlyName(t.id));
    
    // Determine which are cached vs new
    const cached = new Set<string>();
    const newTiles = new Set<string>();
    
    for (const tileId of tileIds) {
      if (this.cachedTileIds.has(tileId)) {
        cached.add(tileId);
      } else {
        newTiles.add(tileId);
      }
    }
    
    // Generate friendly description
    const friendlyDescription = formatDownloadName(tilesWithNames);
    
    // Update state
    this.state = {
      selectedArea: bounds,
      requiredTiles: tiles,
      tilesWithNames: tilesWithNames,
      cachedTiles: cached,
      newTiles: newTiles,
      totalTiles: tiles.length,
      downloadSize: calculateDownloadSize(newTiles.size),
      areaSquareKm: calculateAreaKm2(bounds),
      friendlyDescription: friendlyDescription
    };
    
    this.notify();
  }
  
  /**
   * Clear the current selection
   */
  clearSelection(): void {
    this.state = {
      selectedArea: null,
      requiredTiles: [],
      tilesWithNames: [],
      cachedTiles: new Set(),
      newTiles: new Set(),
      totalTiles: 0,
      downloadSize: 0,
      areaSquareKm: 0,
      friendlyDescription: ''
    };
    
    this.notify();
  }
  
  /**
   * Update cached tiles (e.g., after download)
   */
  updateCachedTiles(tileIds: string[]): void {
    for (const id of tileIds) {
      this.cachedTileIds.add(id);
    }
    
    // Recompute if we have a selection
    if (this.state.selectedArea) {
      this.selectArea(this.state.selectedArea);
    }
  }
  
  /**
   * Get current state
   */
  getState(): SelectionState {
    return { ...this.state };
  }
  
  /**
   * Subscribe to state changes
   */
  subscribe(listener: (state: SelectionState) => void): () => void {
    this.listeners.add(listener);
    // Return unsubscribe function
    return () => this.listeners.delete(listener);
  }
  
  private notify(): void {
    const state = this.getState();
    this.listeners.forEach(listener => listener(state));
  }
}

/**
 * Helper to create selection overlay on map
 */
export function createSelectionOverlay(bounds: BoundingBox): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: {
      type: 'selection'
    },
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [bounds.west, bounds.south],
        [bounds.east, bounds.south],
        [bounds.east, bounds.north],
        [bounds.west, bounds.north],
        [bounds.west, bounds.south]
      ]]
    }
  };
}

/**
 * Helper to create tile overlay for visualization
 */
export function createTileOverlay(tiles: TileId[], cached: Set<string>): GeoJSON.FeatureCollection {
  const features = tiles.map(tile => ({
    type: 'Feature' as const,
    properties: {
      id: tile.id,
      cached: cached.has(tile.id)
    },
    geometry: {
      type: 'Polygon' as const,
      coordinates: [[
        [tile.lon, tile.lat],
        [tile.lon + 1, tile.lat],
        [tile.lon + 1, tile.lat + 1],
        [tile.lon, tile.lat + 1],
        [tile.lon, tile.lat]
      ]]
    }
  }));
  
  return {
    type: 'FeatureCollection',
    features
  };
}