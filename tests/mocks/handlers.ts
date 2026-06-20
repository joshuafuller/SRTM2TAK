/**
 * MSW Request Handlers that serve real SRTM test tiles
 * Uses 4 real tiles around Pikes Peak for consistent, realistic testing
 */

import { http, HttpResponse } from 'msw';
import { TEST_OCEAN_TILES, loadTestTile } from '../fixtures/test-tiles';

const S3_BASE_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/skadi';

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
