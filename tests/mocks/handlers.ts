/**
 * MSW Request Handlers that serve real SRTM test tiles
 * Uses 4 real tiles around Pikes Peak for consistent, realistic testing
 */

import { http, HttpResponse } from 'msw';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const S3_BASE_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/skadi';
const TEST_DATA_DIR = path.join(__dirname, '..', '..', 'test-data', 'tiles');

// Our 4 test tiles around Pikes Peak
export const TEST_TILES = new Set([
  'N38W106',
  'N38W105', 
  'N39W106',
  'N39W105'
]);

// Known ocean tiles (return 404)
export const TEST_OCEAN_TILES = new Set([
  'N37W123', // Pacific Ocean off California
  'N38W124', // Pacific Ocean
  'N00W090', // Pacific Ocean at equator
  'S10E105', // Indian Ocean
  'N50W002', // English Channel
  'N40W074', // Atlantic Ocean off NYC
  'N00W000', // Test ocean tile
]);

/**
 * Load real tile data from test fixtures
 */
function loadTestTile(tileId: string): Buffer | null {
  // Check if it's one of our test tiles
  if (!TEST_TILES.has(tileId)) {
    return null;
  }
  
  const tilePath = path.join(TEST_DATA_DIR, `${tileId}.hgt.gz`);
  
  try {
    return fs.readFileSync(tilePath);
  } catch (error) {
    console.warn(`Test tile ${tileId} not found at ${tilePath}`);
    return null;
  }
}

/**
 * Get test tile data for E2E tests (for backward compatibility)
 */
export function getTestTileData(tileId: string): { gzipped: Buffer } {
  const tileData = loadTestTile(tileId);
  if (tileData) {
    return { gzipped: tileData };
  }
  
  // For tiles not in our test set, generate mock data
  // This creates realistic SRTM data (25,934,402 bytes)
  const srtmSize = 3601 * 3601 * 2; // 16-bit elevation values
  const uncompressed = Buffer.alloc(srtmSize);
  
  // Fill with realistic elevation data (big-endian 16-bit integers)
  for (let i = 0; i < srtmSize; i += 2) {
    const elevation = Math.floor(Math.random() * 4000) + 100; // 100-4100m
    uncompressed.writeUInt16BE(elevation, i);
  }
  
  // Compress the data
  const gzipped = require('zlib').gzipSync(uncompressed);
  return { gzipped };
}

export const handlers = [
  // Mock SRTM tile download
  http.get(`${S3_BASE_URL}/:folder/:filename`, ({ params }) => {
    const folder = params.folder as string;
    const filename = params.filename as string;
    
    // Extract tile ID from filename (e.g., "N39W105.hgt.gz" -> "N39W105")
    const tileId = filename.replace('.hgt.gz', '');
    
    // Validate folder matches tile (first 3 chars of tile ID)
    const expectedFolder = tileId.substring(0, 3);
    if (folder !== expectedFolder) {
      // Return S3-style 404 XML
      return new HttpResponse(
        `<?xml version="1.0" encoding="UTF-8"?>
<Error>
  <Code>NoSuchKey</Code>
  <Message>The specified key does not exist.</Message>
  <Key>elevation-tiles-prod/skadi/${folder}/${filename}</Key>
  <RequestId>MOCK123456789</RequestId>
  <HostId>MockHostId123456789</HostId>
</Error>`,
        {
          status: 404,
          headers: {
            'Content-Type': 'application/xml',
            'x-amz-request-id': 'MOCK123456789',
            'x-amz-id-2': 'MockHostId123456789',
          },
        }
      );
    }
    
    // Check if it's an ocean tile (404)
    if (TEST_OCEAN_TILES.has(tileId)) {
      return new HttpResponse(
        `<?xml version="1.0" encoding="UTF-8"?>
<Error>
  <Code>NoSuchKey</Code>
  <Message>The specified key does not exist.</Message>
  <Key>elevation-tiles-prod/skadi/${folder}/${filename}</Key>
  <RequestId>OCEAN${Date.now()}</RequestId>
  <HostId>OceanTileHost${Date.now()}</HostId>
</Error>`,
        {
          status: 404,
          headers: {
            'Content-Type': 'application/xml',
            'x-amz-request-id': `OCEAN${Date.now()}`,
            'x-amz-id-2': `OceanTileHost${Date.now()}`,
          },
        }
      );
    }
    
    // Try to load real test tile data
    const tileData = loadTestTile(tileId);
    
    if (tileData) {
      // Return real tile data with proper S3 headers
      return new HttpResponse(tileData, {
        status: 200,
        headers: {
          'Content-Type': 'application/x-gzip',
          'Content-Length': tileData.length.toString(),
          'Content-Encoding': 'identity',
          'ETag': `"${tileId}-${tileData.length}"`,
          'Last-Modified': new Date().toUTCString(),
          'x-amz-request-id': `MOCK${Date.now()}`,
          'x-amz-id-2': `MockHost${Date.now()}`,
          'Cache-Control': 'public, max-age=31536000',
          'Accept-Ranges': 'bytes',
        },
      });
    }
    
    // For any other tile, return 404 (not in our test set)
    return new HttpResponse(
      `<?xml version="1.0" encoding="UTF-8"?>
<Error>
  <Code>NoSuchKey</Code>
  <Message>The specified key does not exist.</Message>
  <Key>elevation-tiles-prod/skadi/${folder}/${filename}</Key>
  <RequestId>NOTFOUND${Date.now()}</RequestId>
  <HostId>NotFoundHost${Date.now()}</HostId>
</Error>`,
      {
        status: 404,
        headers: {
          'Content-Type': 'application/xml',
          'x-amz-request-id': `NOTFOUND${Date.now()}`,
          'x-amz-id-2': `NotFoundHost${Date.now()}`,
        },
      }
    );
  }),
  
  // Mock health check endpoint (if needed)
  http.get('https://s3.amazonaws.com/', () => {
    return new HttpResponse(null, { status: 200 });
  }),
];