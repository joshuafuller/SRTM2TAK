/**
 * Shared SRTM test-tile fixtures: the deterministic Pikes Peak tile set, the
 * known ocean tiles, and a loader for the gzipped fixture files on disk.
 *
 * This module is intentionally msw-free so it can be consumed by both the MSW
 * handlers (Node-only unit/integration tests) and the Playwright e2e route mock
 * without pulling `msw` into the browser test path.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** On-disk location of the gzipped fixture tiles. */
export const TEST_DATA_DIR = path.join(__dirname, '..', '..', 'test-data', 'tiles');

/** Four real tiles around Pikes Peak used as deterministic download fixtures. */
export const TEST_TILES = new Set(['N38W106', 'N38W105', 'N39W106', 'N39W105']);

/** Known ocean tiles that S3 serves as 404s (no elevation data). */
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
 * Load a gzipped fixture tile by id. Returns null when the id is not a known
 * test tile or the fixture file is missing on disk.
 */
export function loadTestTile(tileId: string): Buffer | null {
  if (!TEST_TILES.has(tileId)) return null;

  const tilePath = path.join(TEST_DATA_DIR, `${tileId}.hgt.gz`);
  return fs.existsSync(tilePath) ? fs.readFileSync(tilePath) : null;
}
