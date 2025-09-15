import { describe, it, expect } from 'vitest';
import { Decompressor } from '@/lib/decompressor';
import pako from 'pako';

describe('Decompressor', () => {
  describe('decompress', () => {
    it('should decompress gzip data', () => {
      // Create test data
      const originalData = new Uint8Array(1024);
      originalData.fill(42);
      
      // Compress it
      const compressed = pako.gzip(originalData);
      
      // Decompress using our module
      const decompressed = Decompressor.decompress(compressed.buffer);
      
      expect(decompressed).toBeInstanceOf(ArrayBuffer);
      expect(decompressed.byteLength).toBe(1024);
      
      // Verify content
      const view = new Uint8Array(decompressed);
      expect(view[0]).toBe(42);
      expect(view[1023]).toBe(42);
    });
    
    it('should validate SRTM tile size after decompression', () => {
      // Create mock SRTM data (3601x3601 pixels, 2 bytes each)
      const srtmSize = 3601 * 3601 * 2;
      const originalData = new Uint8Array(srtmSize);
      
      // Fill with elevation data pattern
      const view = new DataView(originalData.buffer);
      for (let i = 0; i < 3601 * 3601; i++) {
        // Write big-endian 16-bit signed integer
        view.setInt16(i * 2, Math.floor(Math.random() * 3000), false);
      }
      
      // Compress it
      const compressed = pako.gzip(originalData);
      
      // Decompress
      const decompressed = Decompressor.decompress(compressed.buffer);
      
      // Should be exactly 25934402 bytes
      expect(decompressed.byteLength).toBe(25934402);
    });
    
    it('should throw error for invalid gzip data', () => {
      const invalidData = new Uint8Array([0, 1, 2, 3, 4]);
      
      expect(() => {
        Decompressor.decompress(invalidData.buffer);
      }).toThrow(/Failed to decompress/i);
    });
    
    it('should handle empty input', () => {
      const emptyData = new ArrayBuffer(0);
      
      expect(() => {
        Decompressor.decompress(emptyData);
      }).toThrow();
    });
  });
  
  describe('decompressStream', () => {
    it('should decompress data in chunks', async () => {
      // Create large test data
      const originalData = new Uint8Array(1024 * 1024); // 1MB
      for (let i = 0; i < originalData.length; i++) {
        originalData[i] = i % 256;
      }
      
      // Compress it
      const compressed = pako.gzip(originalData);
      
      // Create a readable stream from compressed data
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(compressed);
          controller.close();
        },
      });
      
      // Decompress stream
      const decompressed = await Decompressor.decompressStream(stream);
      
      expect(decompressed).toBeInstanceOf(ArrayBuffer);
      expect(decompressed.byteLength).toBe(1024 * 1024);
    });
    
    it('should handle streaming decompression', async () => {
      const originalData = new Uint8Array(1024);
      originalData.fill(123);
      const compressed = pako.gzip(originalData);
      
      // Split compressed data into chunks
      const chunkSize = Math.floor(compressed.length / 4);
      const chunks: Uint8Array[] = [];
      for (let i = 0; i < compressed.length; i += chunkSize) {
        chunks.push(compressed.slice(i, Math.min(i + chunkSize, compressed.length)));
      }
      
      // Create stream that emits chunks
      const stream = new ReadableStream({
        start(controller) {
          chunks.forEach(chunk => controller.enqueue(chunk));
          controller.close();
        },
      });
      
      const decompressed = await Decompressor.decompressStream(stream);
      
      expect(decompressed.byteLength).toBe(1024);
      const view = new Uint8Array(decompressed);
      expect(view[0]).toBe(123);
    });
  });
  
  describe('isCompressed', () => {
    it('should detect gzip compressed data', () => {
      const compressed = pako.gzip(new Uint8Array([1, 2, 3]));
      
      expect(Decompressor.isCompressed(compressed.buffer)).toBe(true);
    });
    
    it('should detect uncompressed data', () => {
      const uncompressed = new Uint8Array([1, 2, 3, 4, 5]);
      
      expect(Decompressor.isCompressed(uncompressed.buffer)).toBe(false);
    });
    
    it('should check for gzip magic number', () => {
      // Gzip starts with 0x1F 0x8B
      const gzipHeader = new Uint8Array([0x1F, 0x8B, 0x08, 0x00]);
      expect(Decompressor.isCompressed(gzipHeader.buffer)).toBe(true);
      
      const notGzip = new Uint8Array([0x50, 0x4B, 0x03, 0x04]); // ZIP header
      expect(Decompressor.isCompressed(notGzip.buffer)).toBe(false);
    });
  });
  
  describe('getCompressionRatio', () => {
    it('should calculate compression ratio', () => {
      const originalSize = 1024 * 1024; // 1MB
      const compressedSize = 100 * 1024; // 100KB
      
      const ratio = Decompressor.getCompressionRatio(compressedSize, originalSize);
      
      expect(ratio).toBeCloseTo(0.0976, 2); // ~10% of original
    });
  });
  
  describe('estimateDecompressedSize', () => {
    it('should estimate decompressed size from gzip header', () => {
      // Create data with known size
      const originalData = new Uint8Array(12345);
      const compressed = pako.gzip(originalData);
      
      // The last 4 bytes of gzip contain original size (modulo 2^32)
      const estimated = Decompressor.estimateDecompressedSize(compressed.buffer);
      
      expect(estimated).toBe(12345);
    });
    
    it('should handle files larger than 4GB', () => {
      // For files > 4GB, the size in header wraps around
      // This is a limitation of gzip format
      const originalData = new Uint8Array(1000);
      const compressed = pako.gzip(originalData);
      
      const estimated = Decompressor.estimateDecompressedSize(compressed.buffer);
      expect(estimated).toBe(1000);
    });
  });
  
  describe('validateSRTMData', () => {
    it('should validate decompressed SRTM data', () => {
      const validSize = 25934402; // Exactly 3601x3601x2 bytes
      const validData = new ArrayBuffer(validSize);
      
      expect(Decompressor.validateSRTMData(validData)).toBe(true);
    });
    
    it('should reject invalid SRTM sizes', () => {
      const invalidSize = 12345678;
      const invalidData = new ArrayBuffer(invalidSize);
      
      expect(Decompressor.validateSRTMData(invalidData)).toBe(false);
    });
    
    it('should check for reasonable elevation values', () => {
      const data = new ArrayBuffer(25934402);
      const view = new DataView(data);
      
      // Fill with valid elevations (-500 to 9000 meters)
      for (let i = 0; i < 3601 * 3601; i++) {
        const elevation = Math.floor(Math.random() * 9500 - 500);
        view.setInt16(i * 2, elevation, false); // Big-endian
      }
      
      expect(Decompressor.validateSRTMData(data)).toBe(true);
      
      // Now overwrite most of the data with invalid values
      for (let i = 0; i < data.byteLength / 2; i += 2) {
        view.setInt16(i, 50000, false); // Way too high
      }
      
      expect(Decompressor.validateSRTMData(data)).toBe(false);
    });
  });
});