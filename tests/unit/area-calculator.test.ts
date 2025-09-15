import { describe, it, expect } from 'vitest';
import { AreaCalculator } from '@/lib/area-calculator';

describe('AreaCalculator', () => {
  describe('boundsToTiles', () => {
    it('should convert bounds to tile list', () => {
      const bounds = {
        north: 37,
        south: 35,
        east: -111,
        west: -113,
      };
      
      const tiles = AreaCalculator.boundsToTiles(bounds);
      
      expect(tiles).toContain('N35W113');
      expect(tiles).toContain('N35W112');
      expect(tiles).toContain('N36W113');
      expect(tiles).toContain('N36W112');
      expect(tiles).toContain('N37W113');
      expect(tiles).toContain('N37W112');
      expect(tiles).toHaveLength(6);
    });
    
    it('should handle single tile selection', () => {
      const bounds = {
        north: 36.5,
        south: 36.1,
        east: -112.1,
        west: -112.9,
      };
      
      const tiles = AreaCalculator.boundsToTiles(bounds);
      
      expect(tiles).toEqual(['N36W113']);
    });
    
    it('should handle antimeridian crossing', () => {
      const bounds = {
        north: 35,
        south: 34,
        east: -179,
        west: 179,
      };
      
      const tiles = AreaCalculator.boundsToTiles(bounds);
      
      expect(tiles).toContain('N34E179');
      expect(tiles).toContain('N34E180');
      expect(tiles).toContain('N34W180');
      expect(tiles).toContain('N34W179');
    });
    
    it('should handle equator crossing', () => {
      const bounds = {
        north: 1,
        south: -1,
        east: 10,
        west: 8,
      };
      
      const tiles = AreaCalculator.boundsToTiles(bounds);
      
      expect(tiles).toContain('S01E008');
      expect(tiles).toContain('S01E009');
      expect(tiles).toContain('S01E010');
      expect(tiles).toContain('N00E008');
      expect(tiles).toContain('N00E009');
      expect(tiles).toContain('N00E010');
      expect(tiles).toContain('N01E008');
      expect(tiles).toContain('N01E009');
      expect(tiles).toContain('N01E010');
    });
  });
  
  describe('validateSRTMCoverage', () => {
    it('should validate SRTM coverage limits', () => {
      // SRTM covers 60°N to 56°S
      expect(AreaCalculator.validateSRTMCoverage(59, 0)).toBe(true);
      expect(AreaCalculator.validateSRTMCoverage(-55, 0)).toBe(true);
      expect(AreaCalculator.validateSRTMCoverage(61, 0)).toBe(false);
      expect(AreaCalculator.validateSRTMCoverage(-57, 0)).toBe(false);
    });
  });
  
  describe('calculateTileCount', () => {
    it('should calculate correct tile count', () => {
      const bounds = {
        north: 40,
        south: 30,
        east: -100,
        west: -110,
      };
      
      const count = AreaCalculator.calculateTileCount(bounds);
      expect(count).toBe(121); // 11x11 grid
    });
  });
  
  describe('getTileInfo', () => {
    it('should return tile information', () => {
      const info = AreaCalculator.getTileInfo('N36W112');
      
      expect(info).toEqual({
        id: 'N36W112',
        lat: 36,
        lon: -112,
        north: 37,
        south: 36,
        east: -112,
        west: -113,
        s3Path: 'N36/N36W112.hgt.gz',
      });
    });
    
    it('should handle southern hemisphere tiles', () => {
      const info = AreaCalculator.getTileInfo('S34E018');
      
      expect(info).toEqual({
        id: 'S34E018',
        lat: -34,
        lon: 18,
        north: -34,
        south: -35,
        east: 19,
        west: 18,
        s3Path: 'S34/S34E018.hgt.gz',
      });
    });
  });
});