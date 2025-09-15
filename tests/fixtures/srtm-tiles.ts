import pako from 'pako';

/**
 * Generate sample SRTM HGT data
 * SRTM1 format: 3601x3601 pixels, 16-bit signed integers, big-endian
 */
export function generateSRTMData(
  minElevation: number = 0,
  maxElevation: number = 1000
): ArrayBuffer {
  const size = 3601 * 3601;
  const buffer = new ArrayBuffer(size * 2); // 2 bytes per pixel
  const view = new DataView(buffer);
  
  // Fill with random elevation data
  for (let i = 0; i < size; i++) {
    const elevation = Math.floor(
      Math.random() * (maxElevation - minElevation) + minElevation
    );
    // Write as big-endian 16-bit signed integer
    view.setInt16(i * 2, elevation, false);
  }
  
  return buffer;
}

/**
 * Generate compressed SRTM data (gzipped)
 */
export function generateCompressedSRTM(
  minElevation: number = 0,
  maxElevation: number = 1000
): Uint8Array {
  const rawData = generateSRTMData(minElevation, maxElevation);
  return pako.gzip(new Uint8Array(rawData));
}

/**
 * Generate a small test tile (100x100 instead of 3601x3601)
 */
export function generateSmallTestTile(): ArrayBuffer {
  const size = 100 * 100;
  const buffer = new ArrayBuffer(size * 2);
  const view = new DataView(buffer);
  
  // Create a simple elevation pattern (pyramid)
  for (let y = 0; y < 100; y++) {
    for (let x = 0; x < 100; x++) {
      const distFromCenter = Math.abs(50 - x) + Math.abs(50 - y);
      const elevation = Math.max(0, 1000 - distFromCenter * 10);
      view.setInt16((y * 100 + x) * 2, elevation, false);
    }
  }
  
  return buffer;
}

/**
 * Test tile metadata
 */
export const testTiles = {
  // Grand Canyon area
  N36W112: {
    lat: 36,
    lon: -112,
    name: 'N36W112.hgt',
    compressed: 'N36W112.hgt.gz',
    minElevation: 600,
    maxElevation: 2700,
    size: 25934402,
    compressedSize: 6826524,
  },
  // South Carolina
  N34W081: {
    lat: 34,
    lon: -81,
    name: 'N34W081.hgt',
    compressed: 'N34W081.hgt.gz',
    minElevation: 0,
    maxElevation: 500,
    size: 25934402,
    compressedSize: 6500000,
  },
  // Ocean tile (should 404)
  N00W000: {
    lat: 0,
    lon: 0,
    name: 'N00W000.hgt',
    compressed: 'N00W000.hgt.gz',
    minElevation: -9999,
    maxElevation: -9999,
    size: 0,
    compressedSize: 0,
  },
};

/**
 * Generate mock tile data for a specific tile ID
 */
export function generateMockTileData(tileId: string): ArrayBuffer | null {
  const tile = Object.values(testTiles).find(t => t.name.startsWith(tileId));
  if (!tile) return null;
  
  if (tile.size === 0) return null; // Ocean tile
  
  return generateSRTMData(tile.minElevation, tile.maxElevation);
}

/**
 * Create a mock download response
 */
export function createMockDownloadResponse(tileId: string): Response {
  const data = generateMockTileData(tileId);
  
  if (!data) {
    return new Response(null, { status: 404 });
  }
  
  const compressed = pako.gzip(new Uint8Array(data));
  
  return new Response(compressed, {
    status: 200,
    headers: {
      'Content-Type': 'application/gzip',
      'Content-Length': compressed.length.toString(),
      'Access-Control-Allow-Origin': '*',
    },
  });
}