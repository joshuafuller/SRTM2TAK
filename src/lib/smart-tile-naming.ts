/**
 * Smart Geographic Tile Naming System
 * 
 * Generates meaningful tile names without requiring a massive database
 * Uses a combination of:
 * - Major city/landmark anchors
 * - State/region detection
 * - Relative positioning (North/South/East/West/Central)
 * - Distance-based naming from known points
 */

export interface TileInfo {
  id: string;
  friendlyName: string;
  primaryCity?: string;
  region?: string;
  country?: string;
  feature?: string;
  type: 'land' | 'ocean' | 'coastal';
}

interface CityAnchor {
  name: string;
  lat: number;
  lon: number;
  state?: string;
  importance: number; // 1-10, helps prioritize which city to reference
}

// Minimal database of major anchor cities
// Only includes major metropolitan areas and landmarks
const CITY_ANCHORS: CityAnchor[] = [
  // Major US Cities (population > 500k or state capitals)
  { name: 'New York City', lat: 40.7128, lon: -74.0060, state: 'New York', importance: 10 },
  { name: 'Los Angeles', lat: 34.0522, lon: -118.2437, state: 'California', importance: 10 },
  { name: 'Chicago', lat: 41.8781, lon: -87.6298, state: 'Illinois', importance: 10 },
  { name: 'Houston', lat: 29.7604, lon: -95.3698, state: 'Texas', importance: 9 },
  { name: 'Phoenix', lat: 33.4484, lon: -112.0740, state: 'Arizona', importance: 9 },
  { name: 'Philadelphia', lat: 39.9526, lon: -75.1652, state: 'Pennsylvania', importance: 9 },
  { name: 'San Antonio', lat: 29.4241, lon: -98.4936, state: 'Texas', importance: 8 },
  { name: 'San Diego', lat: 32.7157, lon: -117.1611, state: 'California', importance: 8 },
  { name: 'Dallas', lat: 32.7767, lon: -96.7970, state: 'Texas', importance: 9 },
  { name: 'San Francisco', lat: 37.7749, lon: -122.4194, state: 'California', importance: 9 },
  { name: 'Denver', lat: 39.7392, lon: -104.9903, state: 'Colorado', importance: 8 },
  { name: 'Seattle', lat: 47.6062, lon: -122.3321, state: 'Washington', importance: 8 },
  { name: 'Miami', lat: 25.7617, lon: -80.1918, state: 'Florida', importance: 8 },
  { name: 'Atlanta', lat: 33.7490, lon: -84.3880, state: 'Georgia', importance: 8 },
  { name: 'Boston', lat: 42.3601, lon: -71.0589, state: 'Massachusetts', importance: 8 },
  { name: 'Detroit', lat: 42.3314, lon: -83.0458, state: 'Michigan', importance: 7 },
  { name: 'Minneapolis', lat: 44.9778, lon: -93.2650, state: 'Minnesota', importance: 7 },
  { name: 'Salt Lake City', lat: 40.7608, lon: -111.8910, state: 'Utah', importance: 7 },
  { name: 'Las Vegas', lat: 36.1699, lon: -115.1398, state: 'Nevada', importance: 7 },
  { name: 'Portland', lat: 45.5152, lon: -122.6784, state: 'Oregon', importance: 7 },
  { name: 'Milwaukee', lat: 43.0389, lon: -87.9065, state: 'Wisconsin', importance: 7 },
  { name: 'Kansas City', lat: 39.0997, lon: -94.5786, state: 'Missouri', importance: 6 },
  { name: 'St. Louis', lat: 38.6270, lon: -90.1994, state: 'Missouri', importance: 6 },
  { name: 'New Orleans', lat: 29.9511, lon: -90.0715, state: 'Louisiana', importance: 7 },
  
  // State Capitals (not already listed)
  { name: 'Sacramento', lat: 38.5816, lon: -121.4944, state: 'California', importance: 5 },
  { name: 'Albany', lat: 42.6526, lon: -73.7562, state: 'New York', importance: 4 },
  { name: 'Austin', lat: 30.2672, lon: -97.7431, state: 'Texas', importance: 7 },
  { name: 'Madison', lat: 43.0731, lon: -89.4012, state: 'Wisconsin', importance: 5 },
  { name: 'Des Moines', lat: 41.5868, lon: -93.6250, state: 'Iowa', importance: 4 },
  { name: 'Cheyenne', lat: 41.1400, lon: -104.8202, state: 'Wyoming', importance: 4 },
  { name: 'Boise', lat: 43.6150, lon: -116.2023, state: 'Idaho', importance: 5 },
  
  // Major Landmarks
  { name: 'Grand Canyon', lat: 36.1069, lon: -112.1126, state: 'Arizona', importance: 8 },
  { name: 'Yellowstone', lat: 44.4280, lon: -110.5885, state: 'Wyoming', importance: 8 },
  { name: 'Yosemite', lat: 37.8651, lon: -119.5383, state: 'California', importance: 7 },
  { name: 'Mount Rushmore', lat: 43.8791, lon: -103.4591, state: 'South Dakota', importance: 6 },
];

// State boundaries (simplified)
const STATE_BOUNDS: Record<string, { north: number; south: number; east: number; west: number }> = {
  'Alabama': { north: 35.0, south: 30.2, east: -84.9, west: -88.5 },
  'Alaska': { north: 71.4, south: 54.5, east: -129.9, west: -172.5 },
  'Arizona': { north: 37.0, south: 31.3, east: -109.0, west: -114.8 },
  'Arkansas': { north: 36.5, south: 33.0, east: -89.6, west: -94.6 },
  'California': { north: 42.0, south: 32.5, east: -114.1, west: -124.4 },
  'Colorado': { north: 41.0, south: 37.0, east: -102.0, west: -109.1 },
  'Connecticut': { north: 42.1, south: 40.9, east: -71.8, west: -73.7 },
  'Delaware': { north: 39.8, south: 38.5, east: -75.0, west: -75.8 },
  'Florida': { north: 31.0, south: 24.5, east: -80.0, west: -87.6 },
  'Georgia': { north: 35.0, south: 30.4, east: -80.8, west: -85.6 },
  'Hawaii': { north: 22.2, south: 18.9, east: -154.8, west: -160.2 },
  'Idaho': { north: 49.0, south: 42.0, east: -111.0, west: -117.2 },
  'Illinois': { north: 42.5, south: 37.0, east: -87.5, west: -91.5 },
  'Indiana': { north: 41.8, south: 37.8, east: -84.8, west: -88.1 },
  'Iowa': { north: 43.5, south: 40.4, east: -90.1, west: -96.6 },
  'Kansas': { north: 40.0, south: 37.0, east: -94.6, west: -102.1 },
  'Kentucky': { north: 39.1, south: 36.5, east: -81.9, west: -89.6 },
  'Louisiana': { north: 33.0, south: 29.0, east: -89.0, west: -94.0 },
  'Maine': { north: 47.5, south: 43.0, east: -66.9, west: -71.1 },
  'Maryland': { north: 39.7, south: 37.9, east: -75.0, west: -79.5 },
  'Massachusetts': { north: 42.9, south: 41.2, east: -69.9, west: -73.5 },
  'Michigan': { north: 48.2, south: 41.7, east: -82.4, west: -90.4 },
  'Minnesota': { north: 49.4, south: 43.5, east: -89.5, west: -97.2 },
  'Mississippi': { north: 35.0, south: 30.2, east: -88.1, west: -91.7 },
  'Missouri': { north: 40.6, south: 36.0, east: -89.1, west: -95.8 },
  'Montana': { north: 49.0, south: 44.4, east: -104.0, west: -116.1 },
  'Nebraska': { north: 43.0, south: 40.0, east: -95.3, west: -104.1 },
  'Nevada': { north: 42.0, south: 35.0, east: -114.0, west: -120.0 },
  'New Hampshire': { north: 45.3, south: 42.7, east: -70.6, west: -72.6 },
  'New Jersey': { north: 41.4, south: 38.9, east: -74.0, west: -75.6 },
  'New Mexico': { north: 37.0, south: 32.0, east: -103.0, west: -109.1 },
  'New York': { north: 45.0, south: 40.5, east: -71.9, west: -79.8 },
  'North Carolina': { north: 36.6, south: 33.8, east: -75.5, west: -84.3 },
  'North Dakota': { north: 49.0, south: 45.9, east: -96.6, west: -104.0 },
  'Ohio': { north: 42.0, south: 38.4, east: -80.5, west: -84.8 },
  'Oklahoma': { north: 37.0, south: 33.6, east: -94.4, west: -103.0 },
  'Oregon': { north: 46.3, south: 42.0, east: -116.5, west: -124.6 },
  'Pennsylvania': { north: 42.3, south: 39.7, east: -74.7, west: -80.5 },
  'Rhode Island': { north: 42.0, south: 41.3, east: -71.1, west: -71.9 },
  'South Carolina': { north: 35.2, south: 32.0, east: -78.5, west: -83.4 },
  'South Dakota': { north: 45.9, south: 42.5, east: -96.4, west: -104.1 },
  'Tennessee': { north: 36.7, south: 35.0, east: -81.6, west: -90.3 },
  'Texas': { north: 36.5, south: 25.8, east: -93.5, west: -106.6 },
  'Utah': { north: 42.0, south: 37.0, east: -109.0, west: -114.0 },
  'Vermont': { north: 45.0, south: 42.7, east: -71.5, west: -73.4 },
  'Virginia': { north: 39.5, south: 36.5, east: -75.2, west: -83.7 },
  'Washington': { north: 49.0, south: 45.5, east: -116.9, west: -124.7 },
  'West Virginia': { north: 40.6, south: 37.2, east: -77.7, west: -82.6 },
  'Wisconsin': { north: 47.1, south: 42.5, east: -86.8, west: -92.9 },
  'Wyoming': { north: 45.0, south: 41.0, east: -104.0, west: -111.1 },
};

/**
 * Get the state for a given coordinate
 */
function getStateForCoordinate(lat: number, lon: number): string | null {
  for (const [state, bounds] of Object.entries(STATE_BOUNDS)) {
    if (lat >= bounds.south && lat <= bounds.north &&
        lon >= bounds.west && lon <= bounds.east) {
      return state;
    }
  }
  return null;
}

/**
 * Get position within state (North, South, East, West, Central)
 */
function getPositionInState(lat: number, lon: number, state: string): string {
  const bounds = STATE_BOUNDS[state];
  if (!bounds) return '';

  const latRange = bounds.north - bounds.south;
  const lonRange = bounds.east - bounds.west;
  const latPos = (lat - bounds.south) / latRange;
  const lonPos = (lon - bounds.west) / lonRange;

  let position = '';
  
  // Determine N/S/Central
  if (latPos > 0.66) position = 'Northern';
  else if (latPos < 0.33) position = 'Southern';
  else if (lonPos < 0.33 || lonPos > 0.66) position = ''; // Will use E/W instead
  else position = 'Central';

  // Determine E/W if not central
  if (position !== 'Central') {
    if (lonPos > 0.66) {
      position = position ? `${position.replace('ern', '')}east` : 'Eastern';
    } else if (lonPos < 0.33) {
      position = position ? `${position.replace('ern', '')}west` : 'Western';
    }
  }

  return position;
}

/**
 * Find nearest major city anchor
 */
function findNearestCity(lat: number, lon: number, maxDistance: number = 300): CityAnchor | null {
  let nearest: CityAnchor | null = null;
  let minDistance = maxDistance;

  for (const city of CITY_ANCHORS) {
    // Simple distance calculation (good enough for this purpose)
    const distance = Math.sqrt(
      Math.pow((lat - city.lat) * 111, 2) + 
      Math.pow((lon - city.lon) * 111 * Math.cos(lat * Math.PI / 180), 2)
    );

    if (distance < minDistance) {
      minDistance = distance;
      nearest = city;
    }
  }

  return nearest;
}

/**
 * Get cardinal direction from point A to point B
 */
function getDirection(fromLat: number, fromLon: number, toLat: number, toLon: number): string {
  const dLat = toLat - fromLat;
  const dLon = toLon - fromLon;
  const angle = Math.atan2(dLon, dLat) * 180 / Math.PI;

  if (angle > -22.5 && angle <= 22.5) return 'North';
  if (angle > 22.5 && angle <= 67.5) return 'Northeast';
  if (angle > 67.5 && angle <= 112.5) return 'East';
  if (angle > 112.5 && angle <= 157.5) return 'Southeast';
  if (angle > 157.5 || angle <= -157.5) return 'South';
  if (angle > -157.5 && angle <= -112.5) return 'Southwest';
  if (angle > -112.5 && angle <= -67.5) return 'West';
  if (angle > -67.5 && angle <= -22.5) return 'Northwest';
  return '';
}

/**
 * Parse tile ID to coordinates
 */
function parseTileId(tileId: string): { lat: number; lon: number } | null {
  const match = tileId.match(/([NS])(\d{2})([EW])(\d{3})/);
  if (!match) return null;

  const lat = parseInt(match[2]) * (match[1] === 'S' ? -1 : 1);
  const lon = parseInt(match[4]) * (match[3] === 'W' ? -1 : 1);

  return { lat, lon };
}

/**
 * Detect if tile is ocean
 */
function isOceanTile(lat: number, lon: number): boolean {
  // Simplified ocean detection
  // Pacific
  if (lon < -130 || lon > 160) {
    if (lat < 60 && lat > -60) return true;
  }
  // Atlantic
  if (lon > -60 && lon < -10) {
    if (lat < 40 && lat > -40) return true;
  }
  // Indian Ocean
  if (lon > 40 && lon < 120) {
    if (lat < -10) return true;
  }
  return false;
}

/**
 * Get ocean name
 */
function getOceanName(lat: number, lon: number): string {
  if (lon < -100 || lon > 160) return 'Pacific Ocean';
  if (lon > -100 && lon < -10 && lat < 40) return 'Atlantic Ocean';
  if (lon > 20 && lon < 120 && lat < 20) return 'Indian Ocean';
  if (lat > 66) return 'Arctic Ocean';
  if (lat < -60) return 'Southern Ocean';
  return 'Ocean';
}

/**
 * Main function to get tile-friendly name
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

  const { lat, lon } = coords;

  // Check if ocean
  if (isOceanTile(lat, lon)) {
    return {
      id: tileId,
      friendlyName: getOceanName(lat, lon),
      type: 'ocean'
    };
  }

  // Find state
  const state = getStateForCoordinate(lat, lon);
  
  // Find nearest city
  const nearestCity = findNearestCity(lat, lon);
  
  // Build friendly name
  let friendlyName = '';
  let primaryCity = '';
  const region = state || '';
  const feature = '';
  
  if (nearestCity) {
    const distance = Math.sqrt(
      Math.pow((lat - nearestCity.lat) * 111, 2) + 
      Math.pow((lon - nearestCity.lon) * 111 * Math.cos(lat * Math.PI / 180), 2)
    );

    // If very close to a major city (< 50km), use the city name
    if (distance < 50) {
      primaryCity = nearestCity.name;
      friendlyName = nearestCity.name;
      if (state) friendlyName += `, ${state}`;
    }
    // If moderately close (< 150km), reference the city
    else if (distance < 150 && nearestCity.importance >= 7) {
      const direction = getDirection(nearestCity.lat, nearestCity.lon, lat, lon);
      friendlyName = `${direction} of ${nearestCity.name}`;
      if (state && nearestCity.state !== state) {
        friendlyName += `, ${state}`;
      }
    }
    // Otherwise use state-based naming
    else if (state) {
      const position = getPositionInState(lat, lon, state);
      friendlyName = position ? `${position} ${state}` : state;
    }
  } else if (state) {
    const position = getPositionInState(lat, lon, state);
    friendlyName = position ? `${position} ${state}` : state;
  } else {
    // No state found, use regional naming
    friendlyName = getRegionalName(lat, lon);
  }

  // Check for coastal
  const type = isCoastalTile(lat, lon) ? 'coastal' : 'land';

  return {
    id: tileId,
    friendlyName: friendlyName || tileId,
    primaryCity,
    region,
    feature,
    type
  };
}

/**
 * Check if tile is coastal
 */
function isCoastalTile(lat: number, lon: number): boolean {
  // US Coasts (simplified)
  if (lon <= -117 && lon >= -125 && lat >= 32 && lat <= 49) return true; // West Coast
  if (lon >= -81 && lon <= -75 && lat >= 25 && lat <= 45) return true; // East Coast
  if (lon >= -98 && lon <= -81 && lat >= 25 && lat <= 30) return true; // Gulf Coast
  return false;
}

/**
 * Get regional name for areas outside US states
 */
function getRegionalName(lat: number, lon: number): string {
  // Canada
  if (lat >= 49 && lat <= 60 && lon >= -141 && lon <= -52) {
    if (lon >= -95) return 'Eastern Canada';
    if (lon <= -120) return 'Western Canada';
    return 'Central Canada';
  }
  
  // Mexico
  if (lat >= 14 && lat <= 33 && lon >= -118 && lon <= -86) {
    if (lat >= 28) return 'Northern Mexico';
    if (lat <= 20) return 'Southern Mexico';
    return 'Central Mexico';
  }
  
  // Caribbean
  if (lat >= 10 && lat <= 27 && lon >= -85 && lon <= -59) {
    return 'Caribbean';
  }
  
  // Default to coordinates
  const latStr = Math.abs(lat) + '°' + (lat >= 0 ? 'N' : 'S');
  const lonStr = Math.abs(lon) + '°' + (lon >= 0 ? 'E' : 'W');
  return `${latStr} ${lonStr}`;
}

/**
 * Format download name for multiple tiles
 */
export function formatDownloadName(tiles: TileInfo[]): string {
  if (tiles.length === 0) return 'No tiles selected';
  if (tiles.length === 1) return tiles[0].friendlyName;
  
  // Get all unique regions/states
  const regions = new Set(tiles.map(t => t.region).filter(Boolean));
  const cities = tiles.filter(t => t.primaryCity).map(t => t.primaryCity!);
  
  // If all in same state
  if (regions.size === 1) {
    const region = Array.from(regions)[0];
    return `${region} Area (${tiles.length} tiles)`;
  }
  
  // If has some major cities
  if (cities.length >= tiles.length / 2 && cities.length <= 3) {
    return `${cities.join('-')} Area (${tiles.length} tiles)`;
  }
  
  // Multiple states in US
  if (regions.size > 1 && regions.size <= 3 && 
      Array.from(regions).every(r => r && STATE_BOUNDS[r])) {
    return `${Array.from(regions).join('-')} (${tiles.length} tiles)`;
  }
  
  // Many tiles
  return `${tiles.length} tiles`;
}