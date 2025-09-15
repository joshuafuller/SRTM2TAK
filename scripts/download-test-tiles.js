#!/usr/bin/env node

/**
 * Download real SRTM tiles around Pikes Peak for testing
 * Pikes Peak: 38.8409° N, 105.0422° W
 * 
 * The 4 tiles around Pikes Peak are:
 * - N38W106 (SW tile)
 * - N38W105 (SE tile) 
 * - N39W106 (NW tile)
 * - N39W105 (NE tile)
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TILES = [
  { id: 'N38W106', folder: 'N38' },
  { id: 'N38W105', folder: 'N38' },
  { id: 'N39W106', folder: 'N39' },
  { id: 'N39W105', folder: 'N39' }
];

const TEST_DATA_DIR = path.join(__dirname, '..', 'test-data', 'tiles');

// Create directory if it doesn't exist
if (!fs.existsSync(TEST_DATA_DIR)) {
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
}

async function downloadTile(tile) {
  const url = `https://s3.amazonaws.com/elevation-tiles-prod/skadi/${tile.folder}/${tile.id}.hgt.gz`;
  const compressedPath = path.join(TEST_DATA_DIR, `${tile.id}.hgt.gz`);
  const uncompressedPath = path.join(TEST_DATA_DIR, `${tile.id}.hgt`);
  
  // Check if already downloaded
  if (fs.existsSync(compressedPath) && fs.existsSync(uncompressedPath)) {
    const stats = fs.statSync(uncompressedPath);
    if (stats.size === 25934402) { // Correct SRTM size
      console.log(`✓ ${tile.id} already downloaded (${stats.size} bytes)`);
      return;
    }
  }
  
  console.log(`Downloading ${tile.id} from ${url}...`);
  
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(compressedPath);
    
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${tile.id}: ${response.statusCode}`));
        return;
      }
      
      let downloadedBytes = 0;
      const totalBytes = parseInt(response.headers['content-length'] || '0');
      
      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        const percent = Math.round((downloadedBytes / totalBytes) * 100);
        process.stdout.write(`\r  ${tile.id}: ${percent}% (${downloadedBytes}/${totalBytes} bytes)`);
      });
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log(`\n  ✓ Downloaded ${tile.id} (${downloadedBytes} bytes compressed)`);
        
        // Decompress the file
        console.log(`  Decompressing ${tile.id}...`);
        const compressed = fs.readFileSync(compressedPath);
        const decompressed = zlib.gunzipSync(compressed);
        fs.writeFileSync(uncompressedPath, decompressed);
        console.log(`  ✓ Decompressed ${tile.id} (${decompressed.length} bytes)`);
        
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(compressedPath, () => {}); // Delete partial file
      reject(err);
    });
  });
}

async function main() {
  console.log('Downloading SRTM tiles around Pikes Peak for testing...\n');
  console.log('Pikes Peak location: 38.8409° N, 105.0422° W');
  console.log('Tiles to download:', TILES.map(t => t.id).join(', '));
  console.log(`Saving to: ${TEST_DATA_DIR}\n`);
  
  for (const tile of TILES) {
    try {
      await downloadTile(tile);
    } catch (error) {
      console.error(`Failed to download ${tile.id}:`, error.message);
      process.exit(1);
    }
  }
  
  console.log('\n✓ All tiles downloaded successfully!');
  
  // List final files
  console.log('\nTest data files:');
  const files = fs.readdirSync(TEST_DATA_DIR);
  for (const file of files) {
    const stats = fs.statSync(path.join(TEST_DATA_DIR, file));
    console.log(`  ${file}: ${stats.size} bytes`);
  }
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});