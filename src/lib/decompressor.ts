/**
 * Decompressor module for handling gzipped SRTM tiles
 * Uses pako for gzip decompression
 */

import pako from 'pako';

export class Decompressor {
  /**
   * Decompress gzipped data
   */
  static decompress(gzippedData: ArrayBuffer): ArrayBuffer {
    try {
      // Convert ArrayBuffer to Uint8Array for pako
      const compressed = new Uint8Array(gzippedData);
      
      // Decompress using pako
      const decompressed = pako.ungzip(compressed);
      
      // Return as ArrayBuffer
      return decompressed.buffer.slice(
        decompressed.byteOffset,
        decompressed.byteOffset + decompressed.byteLength
      );
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to decompress: ${error.message}. Data may be corrupt or not in gzip format.`);
      }
      throw new Error('Failed to decompress: Unknown error');
    }
  }
  
  /**
   * Decompress data from a stream
   */
  static async decompressStream(stream: ReadableStream<Uint8Array>): Promise<ArrayBuffer> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    
    try {
      let done = false;
      while (!done) {
        const result = await reader.read();
        done = result.done;
        if (!done && result.value) {
          chunks.push(result.value);
        }
      }
      
      // Combine all chunks
      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }
      
      // Decompress the combined data
      return this.decompress(combined.buffer);
      
    } finally {
      reader.releaseLock();
    }
  }
  
  /**
   * Check if data is compressed (gzip format)
   */
  static isCompressed(data: ArrayBuffer): boolean {
    if (data.byteLength < 2) {
      return false;
    }
    
    // Check for gzip magic number (0x1F 0x8B)
    const view = new DataView(data);
    return view.getUint8(0) === 0x1F && view.getUint8(1) === 0x8B;
  }
  
  /**
   * Get compression ratio
   */
  static getCompressionRatio(compressedSize: number, originalSize: number): number {
    if (originalSize === 0) return 0;
    return compressedSize / originalSize;
  }
  
  /**
   * Estimate decompressed size from gzip header
   * Note: This is only accurate for files < 4GB
   */
  static estimateDecompressedSize(gzippedData: ArrayBuffer): number {
    if (gzippedData.byteLength < 8) {
      throw new Error('Invalid gzip data: too small');
    }
    
    // The last 4 bytes of a gzip file contain the original size (modulo 2^32)
    const view = new DataView(gzippedData);
    const lastFourBytes = view.getUint32(gzippedData.byteLength - 4, true); // Little-endian
    
    return lastFourBytes;
  }
  
  /**
   * Validate SRTM data after decompression
   */
  static validateSRTMData(data: ArrayBuffer): boolean {
    // SRTM1 tiles should be exactly 3601x3601 pixels * 2 bytes
    const expectedSize = 3601 * 3601 * 2;
    
    if (data.byteLength !== expectedSize) {
      return false;
    }
    
    // Additional validation: check for reasonable elevation values
    const view = new DataView(data);
    let hasValidData = false;
    let invalidCount = 0;
    const samplesToCheck = 100; // Check 100 random samples
    
    for (let i = 0; i < samplesToCheck; i++) {
      // Random position in the data
      const position = Math.floor(Math.random() * (data.byteLength / 2)) * 2;
      const elevation = view.getInt16(position, false); // Big-endian
      
      // SRTM uses -32768 for void/water, elevations typically -500 to 9000 meters
      if (elevation !== -32768 && elevation >= -500 && elevation <= 9000) {
        hasValidData = true;
      } else if (elevation < -500 || elevation > 9000) {
        invalidCount++;
      }
    }
    
    // If too many invalid values, data might be corrupt
    if (invalidCount > samplesToCheck * 0.5) {
      return false;
    }
    
    return hasValidData;
  }
  
  /**
   * Compress data (for caching)
   */
  static compress(data: ArrayBuffer, level: number = 6): ArrayBuffer {
    try {
      const uncompressed = new Uint8Array(data);
      const compressed = pako.gzip(uncompressed, { level: level as pako.DeflateOptions['level'] });
      
      return compressed.buffer.slice(
        compressed.byteOffset,
        compressed.byteOffset + compressed.byteLength
      );
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to compress: ${error.message}`);
      }
      throw new Error('Failed to compress: Unknown error');
    }
  }
  
  /**
   * Calculate statistics for SRTM data
   */
  static calculateElevationStats(data: ArrayBuffer): {
    min: number;
    max: number;
    mean: number;
    voidCount: number;
  } {
    const view = new DataView(data);
    const pixelCount = data.byteLength / 2;
    
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let validCount = 0;
    let voidCount = 0;
    
    for (let i = 0; i < pixelCount; i++) {
      const elevation = view.getInt16(i * 2, false); // Big-endian
      
      if (elevation === -32768) {
        voidCount++;
      } else {
        min = Math.min(min, elevation);
        max = Math.max(max, elevation);
        sum += elevation;
        validCount++;
      }
    }
    
    return {
      min: min === Infinity ? -32768 : min,
      max: max === -Infinity ? -32768 : max,
      mean: validCount > 0 ? sum / validCount : 0,
      voidCount,
    };
  }
  
  /**
   * Create a preview/thumbnail of elevation data
   * Returns a smaller array suitable for quick visualization
   */
  static createPreview(data: ArrayBuffer, targetSize: number = 100): Int16Array {
    const view = new DataView(data);
    const sourceSize = 3601;
    const scale = sourceSize / targetSize;
    const preview = new Int16Array(targetSize * targetSize);
    
    for (let y = 0; y < targetSize; y++) {
      for (let x = 0; x < targetSize; x++) {
        // Sample from the original data
        const sourceX = Math.floor(x * scale);
        const sourceY = Math.floor(y * scale);
        const sourceIndex = (sourceY * sourceSize + sourceX) * 2;
        
        if (sourceIndex < data.byteLength) {
          preview[y * targetSize + x] = view.getInt16(sourceIndex, false);
        }
      }
    }
    
    return preview;
  }
}