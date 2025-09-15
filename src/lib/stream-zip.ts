/**
 * Stream ZIP module for creating ZIP archives without loading all data in memory
 * Uses @zip.js/zip.js for streaming compression
 */

import { ZipWriter, BlobWriter, BlobReader, TextReader } from '@zip.js/zip.js';

export interface TileData {
  id: string;
  data: ArrayBuffer;
}

export interface StreamZipOptions {
  compressionLevel?: number;
  comment?: string;
}

export interface ZipProgress {
  current: number;
  total: number;
  percent: number;
  currentFile: string;
}

export class StreamZip {
  /**
   * Create a ZIP file from an async iterable of tiles
   * Processes tiles one at a time to minimize memory usage
   */
  async createZip(
    tiles: AsyncIterable<TileData>,
    options: StreamZipOptions = {}
  ): Promise<Blob> {
    const zipWriter = new ZipWriter(new BlobWriter());
    
    try {
      // Add optional comment to ZIP
      if (options.comment) {
        await zipWriter.add('README.txt', new TextReader(options.comment));
      }
      
      
      // Process tiles one by one
      for await (const tile of tiles) {
        if (!tile.data) {
          throw new Error(`Invalid tile data for ${tile.id}`);
        }
        
        // Create a Blob from the ArrayBuffer
        const blob = new Blob([tile.data]);
        
        // Add to ZIP with optional compression
        await zipWriter.add(
          tile.id.endsWith('.hgt') ? tile.id : `${tile.id}.hgt`,
          new BlobReader(blob),
          {
            level: options.compressionLevel || 0, // 0 = store (no compression for already compressed data)
            onprogress: (_progress, _total) => {
              // Progress for individual file (optional)
              return undefined;
            }
          }
        );
        
        // Clear reference to allow garbage collection
        // The data has been processed and written to the ZIP
      }
      
      
      // Close and return the ZIP blob
      const blob = await zipWriter.close();
      return blob;
      
    } catch (error) {
      // Ensure writer is closed on error
      try {
        await zipWriter.close();
      } catch {
        // Ignore close errors
      }
      throw error;
    }
  }
  
  /**
   * Create a ZIP file with progress reporting
   */
  async createZipWithProgress(
    tiles: AsyncIterable<TileData>,
    totalTiles: number,
    onProgress: (progress: ZipProgress) => void,
    options: StreamZipOptions = {}
  ): Promise<Blob> {
    const zipWriter = new ZipWriter(new BlobWriter());
    let current = 0;
    
    try {
      // Add optional comment
      if (options.comment) {
        await zipWriter.add('README.txt', new TextReader(options.comment));
      }
      
      // Process tiles with progress
      for await (const tile of tiles) {
        if (!tile.data) {
          throw new Error(`Invalid tile data for ${tile.id}`);
        }
        
        current++;
        const filename = tile.id.endsWith('.hgt') ? tile.id : `${tile.id}.hgt`;
        
        // Report progress before processing
        onProgress({
          current,
          total: totalTiles,
          percent: Math.round((current / totalTiles) * 100),
          currentFile: filename,
        });
        
        // Create blob and add to ZIP
        const blob = new Blob([tile.data]);
        
        await zipWriter.add(
          filename,
          new BlobReader(blob),
          {
            level: options.compressionLevel || 0,
          }
        );
      }
      
      // Report completion
      onProgress({
        current: totalTiles,
        total: totalTiles,
        percent: 100,
        currentFile: 'Complete',
      });
      
      return await zipWriter.close();
      
    } catch (error) {
      try {
        await zipWriter.close();
      } catch {
        // Ignore close errors
      }
      throw error;
    }
  }
  
  /**
   * Create a ZIP from tiles stored in IndexedDB or memory
   * This version accepts a simple array but processes sequentially
   */
  async createZipFromArray(
    tiles: TileData[],
    options: StreamZipOptions = {}
  ): Promise<Blob> {
    // Convert array to async iterable
    async function* tileGenerator() {
      for (const tile of tiles) {
        yield tile;
        // Allow event loop to process other tasks
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    
    return this.createZip(tileGenerator(), options);
  }
  
  /**
   * Estimate ZIP file size (rough estimate)
   */
  static estimateZipSize(tiles: { size: number }[]): number {
    // ZIP overhead is typically minimal for already compressed files
    // Add ~22 bytes per file for local header + ~46 bytes for central directory
    const overhead = tiles.length * 68;
    const dataSize = tiles.reduce((sum, tile) => sum + tile.size, 0);
    return dataSize + overhead + 22; // +22 for end of central directory
  }
  
  /**
   * Create a manifest file for the ZIP
   */
  static createManifest(tiles: string[]): string {
    const manifest = {
      created: new Date().toISOString(),
      source: 'SRTM2TAK',
      tiles: tiles.map(id => ({
        filename: id.endsWith('.hgt') ? id : `${id}.hgt`,
        format: 'SRTM HGT',
        resolution: '1 arc-second',
        size: '3601x3601 pixels',
      })),
      totalTiles: tiles.length,
      notes: 'Import to ATAK by copying to /ATAK/SRTM/ directory',
    };
    
    return JSON.stringify(manifest, null, 2);
  }
  
  /**
   * Create a README for the ZIP
   */
  static createReadme(tileCount: number, _bounds?: any): string {
    return `SRTM Elevation Data Package
Generated by SRTM2TAK
========================

Contents:
- ${tileCount} SRTM elevation tile(s)
- Format: HGT (Height) files, 3601x3601 pixels
- Resolution: 1 arc-second (~30 meters)

Installation:
1. Extract this ZIP file
2. Copy the .hgt files to your ATAK device:
   - Location: /sdcard/atak/SRTM/ or
   - Location: /ATAK/SRTM/
3. Restart ATAK to load elevation data

Usage:
- Elevation data will automatically display in 3D view
- Use the elevation tool to query specific points
- Terrain analysis tools will use this data

Data Source:
- NASA Shuttle Radar Topography Mission (SRTM)
- Provided via AWS Open Data

Generated: ${new Date().toLocaleString()}
`;
  }
}
