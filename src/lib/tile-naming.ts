/**
 * Geographic Tile Naming System
 * 
 * Converts cryptic tile IDs (N38W105) to meaningful names (Denver-Colorado)
 */

export interface TileInfo {
  id: string;           // Technical ID: "N38W105"
  friendlyName: string; // Human name: "Denver Area, Colorado"
  primaryCity?: string; // Largest city in tile
  region?: string;      // State/Province
  country?: string;     // Country
  feature?: string;     // Notable geographic feature
  type: 'land' | 'ocean' | 'coastal';
}

/**
 * Get human-friendly name for a tile
 * Uses a smart hierarchy:
 * 1. Major city if present
 * 2. Geographic feature if notable
 * 3. Region/State name
 * 4. Ocean/Sea name if water
 */
export function getTileFriendlyName(tileId: string): TileInfo {
  const coords = parseTileId(tileId);
  if (!coords) {
    return {
      id: tileId,
      friendlyName: tileId,
      type: 'land'
    };
  }
  
  // Get tile info from our database
  const info = getTileMetadata(coords.lat, coords.lon);
  
  // Build friendly name based on what's available
  let friendlyName = '';
  
  if (info.type === 'ocean') {
    friendlyName = info.oceanName || 'Ocean';
  } else if (info.primaryCity) {
    // City-based name (most specific)
    friendlyName = info.primaryCity;
    if (info.region) {
      friendlyName += `, ${info.region}`;
    }
  } else if (info.feature) {
    // Geographic feature (mountains, parks, etc.)
    friendlyName = info.feature;
    if (info.region) {
      friendlyName += `, ${info.region}`;
    }
  } else if (info.region) {
    // Region only (rural areas)
    friendlyName = `${info.region}`;
    if (info.country && info.country !== 'USA') {
      friendlyName += `, ${info.country}`;
    }
  } else {
    // Fallback to coordinates
    friendlyName = formatCoordinates(coords.lat, coords.lon);
  }
  
  return {
    id: tileId,
    friendlyName,
    primaryCity: info.primaryCity,
    region: info.region,
    country: info.country,
    feature: info.feature,
    type: info.type || 'land'
  };
}

/**
 * Parse tile ID to coordinates
 */
function parseTileId(tileId: string): { lat: number; lon: number } | null {
  const match = tileId.match(/^([NS])(\d{2})([EW])(\d{3})$/);
  if (!match) return null;
  
  const lat = parseInt(match[2]) * (match[1] === 'N' ? 1 : -1);
  const lon = parseInt(match[4]) * (match[3] === 'E' ? 1 : -1);
  
  return { lat, lon };
}

/**
 * Format coordinates as human-readable
 */
function formatCoordinates(lat: number, lon: number): string {
  const latStr = `${Math.abs(lat)}°${lat >= 0 ? 'N' : 'S'}`;
  const lonStr = `${Math.abs(lon)}°${lon >= 0 ? 'E' : 'W'}`;
  return `${latStr} ${lonStr}`;
}

/**
 * Get metadata for a tile based on coordinates
 * In production, this would query a geographic database
 * For now, using a curated list of important tiles
 */
function getTileMetadata(lat: number, lon: number): any {
  // Major US cities and regions
  const metadata = TILE_METADATA[`${lat},${lon}`];
  if (metadata) return metadata;
  
  // Ocean detection
  if (isOceanTile(lat, lon)) {
    return {
      type: 'ocean',
      oceanName: getOceanName(lat, lon)
    };
  }
  
  // Default to region detection
  return {
    type: 'land',
    region: getRegionName(lat, lon),
    country: getCountryName(lat, lon)
  };
}

/**
 * Curated database of notable tiles
 * This covers major cities and landmarks
 */
const TILE_METADATA: Record<string, any> = {
  // Colorado
  '39,-105': {
    primaryCity: 'Denver',
    region: 'Colorado',
    country: 'USA',
    feature: 'Front Range',
    type: 'land'
  },
  '39,-106': {
    primaryCity: 'Aspen',
    region: 'Colorado',
    country: 'USA',
    feature: 'Rocky Mountains',
    type: 'land'
  },
  '38,-105': {
    primaryCity: 'Colorado Springs',
    region: 'Colorado',
    country: 'USA',
    feature: 'Pikes Peak',
    type: 'land'
  },
  
  // California
  '37,-122': {
    primaryCity: 'San Francisco',
    region: 'California',
    country: 'USA',
    feature: 'Bay Area',
    type: 'coastal'
  },
  '34,-118': {
    primaryCity: 'Los Angeles',
    region: 'California',
    country: 'USA',
    type: 'coastal'
  },
  '32,-117': {
    primaryCity: 'San Diego',
    region: 'California',
    country: 'USA',
    type: 'coastal'
  },
  
  // East Coast
  '40,-74': {
    primaryCity: 'New York City',
    region: 'New York',
    country: 'USA',
    type: 'coastal'
  },
  '38,-77': {
    primaryCity: 'Washington DC',
    region: 'District of Columbia',
    country: 'USA',
    type: 'land'
  },
  '42,-71': {
    primaryCity: 'Boston',
    region: 'Massachusetts',
    country: 'USA',
    type: 'coastal'
  },
  
  // Wisconsin
  '43,-88': {
    primaryCity: 'Milwaukee',
    region: 'Wisconsin',
    country: 'USA',
    type: 'land'
  },
  '43,-89': {
    primaryCity: 'Madison',
    region: 'Wisconsin',
    country: 'USA',
    type: 'land'
  },
  '43,-90': {
    primaryCity: 'La Crosse',
    region: 'Wisconsin',
    country: 'USA',
    type: 'land'
  },
  '42,-88': {
    primaryCity: 'Racine',
    region: 'Wisconsin',
    country: 'USA',
    type: 'land'
  },
  '42,-89': {
    primaryCity: 'Janesville',
    region: 'Wisconsin',
    country: 'USA',
    type: 'land'
  },
  '42,-90': {
    primaryCity: 'Platteville',
    region: 'Wisconsin',
    country: 'USA',
    type: 'land'
  },
  '44,-89': {
    primaryCity: 'Wausau',
    region: 'Wisconsin',
    country: 'USA',
    type: 'land'
  },
  '44,-90': {
    primaryCity: 'Eau Claire',
    region: 'Wisconsin',
    country: 'USA',
    type: 'land'
  },
  
  // Major Features
  '36,-112': {
    feature: 'Grand Canyon',
    region: 'Arizona',
    country: 'USA',
    type: 'land'
  },
  '44,-110': {
    feature: 'Yellowstone',
    region: 'Wyoming',
    country: 'USA',
    type: 'land'
  },
  '48,-121': {
    primaryCity: 'Seattle',
    region: 'Washington',
    country: 'USA',
    feature: 'Cascade Range',
    type: 'land'
  },
  
  // International
  '51,-0': {
    primaryCity: 'London',
    region: 'England',
    country: 'UK',
    type: 'land'
  },
  '48,2': {
    primaryCity: 'Paris',
    region: 'Île-de-France',
    country: 'France',
    type: 'land'
  },
  '35,139': {
    primaryCity: 'Tokyo',
    region: 'Kanto',
    country: 'Japan',
    type: 'coastal'
  }
};

/**
 * Detect if tile is over ocean
 */
function isOceanTile(lat: number, lon: number): boolean {
  // Pacific Ocean (rough boundaries)
  if (lon < -130 || lon > 160) {
    if (lat < 60 && lat > -60) {
      // Check if not near land masses
      // Simplified - in production would use coastline data
      return true;
    }
  }
  
  // Atlantic Ocean
  if (lon > -80 && lon < -10) {
    if (lat < 30 && lat > -40) {
      return true;
    }
  }
  
  return false;
}

/**
 * Get ocean name for coordinates
 */
function getOceanName(lat: number, lon: number): string {
  if (lon < -100 || lon > 160) {
    if (lat > 0) return 'North Pacific Ocean';
    return 'South Pacific Ocean';
  }
  
  if (lon > -100 && lon < -10) {
    if (lat > 0) return 'North Atlantic Ocean';
    return 'South Atlantic Ocean';
  }
  
  if (lon > 20 && lon < 120) {
    return 'Indian Ocean';
  }
  
  return 'Ocean';
}

/**
 * Get region/state name for US coordinates
 */
function getRegionName(lat: number, lon: number): string {
  // Rough US state boundaries
  if (lat >= 30 && lat <= 49 && lon >= -125 && lon <= -66) {
    // Western states
    if (lon <= -115) {
      if (lat >= 42) return 'Pacific Northwest';
      if (lat >= 36) return 'California';
      return 'Southwest';
    }
    // Mountain states
    if (lon <= -100) {
      if (lat >= 41) return 'Northern Rockies';
      if (lat >= 37) return 'Colorado';
      return 'Southwest';
    }
    // Central states
    if (lon <= -90) {
      if (lat >= 41) return 'Upper Midwest';
      if (lat >= 36) return 'Central Plains';
      return 'Texas';
    }
    // Eastern states
    if (lat >= 41) return 'Northeast';
    if (lat >= 35) return 'Southeast';
    return 'Gulf Coast';
  }
  
  return '';
}

/**
 * Get country name for coordinates
 */
function getCountryName(lat: number, lon: number): string {
  // Simplified country detection
  if (lat >= 25 && lat <= 49 && lon >= -125 && lon <= -66) {
    return 'USA';
  }
  if (lat >= 49 && lat <= 60 && lon >= -141 && lon <= -52) {
    return 'Canada';
  }
  if (lat >= 14 && lat <= 33 && lon >= -118 && lon <= -86) {
    return 'Mexico';
  }
  
  return '';
}

/**
 * Format download with friendly names
 */
export function formatDownloadName(tiles: TileInfo[]): string {
  if (tiles.length === 0) return 'No tiles selected';
  if (tiles.length === 1) return tiles[0].friendlyName;
  
  // Find common characteristics
  const regions = new Set(tiles.map(t => t.region).filter(Boolean));
  const countries = new Set(tiles.map(t => t.country).filter(Boolean));
  const features = new Set(tiles.map(t => t.feature).filter(Boolean));
  
  // Most specific: all in same region (state/province)
  if (regions.size === 1) {
    const region = Array.from(regions)[0];
    return `${region} Area (${tiles.length} tiles)`;
  }
  
  // Check if all tiles are in a recognizable US region
  // even if they don't have explicit region tags
  if (countries.size === 1 && countries.has('USA')) {
    // Group by broader US regions if all are USA
    const broadRegions = new Set<string>();
    for (const tile of tiles) {
      if (tile.region) {
        // Use specific state if available
        broadRegions.add(tile.region);
      } else {
        // Fall back to broad region for unlabeled tiles
        const coords = parseTileId(tile.id);
        if (coords) {
          const usRegion = getRegionName(coords.lat, coords.lon);
          if (usRegion) broadRegions.add(usRegion);
        }
      }
    }
    
    if (broadRegions.size === 1) {
      const region = Array.from(broadRegions)[0];
      return `${region} Area (${tiles.length} tiles)`;
    }
    
    // Multiple US regions
    if (broadRegions.size > 1 && broadRegions.size <= 3) {
      const regionList = Array.from(broadRegions).join('-');
      return `${regionList} (${tiles.length} tiles)`;
    }
  }
  
  // Check for common feature (like Rocky Mountains)
  if (features.size === 1) {
    const feature = Array.from(features)[0];
    return `${feature} Area (${tiles.length} tiles)`;
  }
  
  // All in same country
  if (countries.size === 1) {
    const country = Array.from(countries)[0];
    return `${country} Tiles (${tiles.length} tiles)`;
  }
  
  // Mixed countries/regions
  return `${tiles.length} tiles`;
}

/**
 * Group tiles by region for display
 */
export function groupTilesByRegion(tiles: TileInfo[]): Map<string, TileInfo[]> {
  const groups = new Map<string, TileInfo[]>();
  
  for (const tile of tiles) {
    const key = tile.region || tile.country || 'Other';
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(tile);
  }
  
  return groups;
}