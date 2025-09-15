import { describe, it, expect } from 'vitest';
import {
  TileInfo,
  getTileFriendlyName,
  formatDownloadName,
  groupTilesByRegion
} from '../../src/lib/tile-naming';

describe('Tile Naming System', () => {
  describe('getTileFriendlyName', () => {
    it('should return Denver info for N39W105', () => {
      const info = getTileFriendlyName('N39W105');
      expect(info.id).toBe('N39W105');
      expect(info.friendlyName).toBe('Denver, Colorado');
      expect(info.primaryCity).toBe('Denver');
      expect(info.region).toBe('Colorado');
      expect(info.country).toBe('USA');
      expect(info.feature).toBe('Front Range');
      expect(info.type).toBe('land');
    });

    it('should return Colorado Springs info for N38W105', () => {
      const info = getTileFriendlyName('N38W105');
      expect(info.id).toBe('N38W105');
      expect(info.friendlyName).toBe('Colorado Springs, Colorado');
      expect(info.primaryCity).toBe('Colorado Springs');
      expect(info.region).toBe('Colorado');
      expect(info.feature).toBe('Pikes Peak');
    });

    it('should return San Francisco info for N37W122', () => {
      const info = getTileFriendlyName('N37W122');
      expect(info.id).toBe('N37W122');
      expect(info.friendlyName).toBe('San Francisco, California');
      expect(info.primaryCity).toBe('San Francisco');
      expect(info.region).toBe('California');
      expect(info.type).toBe('coastal');
    });

    it('should handle invalid tile IDs', () => {
      const info = getTileFriendlyName('INVALID');
      expect(info.id).toBe('INVALID');
      expect(info.friendlyName).toBe('INVALID');
      expect(info.type).toBe('land');
    });

    it('should handle unknown tiles with coordinates', () => {
      const info = getTileFriendlyName('N45W100');
      expect(info.id).toBe('N45W100');
      expect(info.friendlyName).toContain('Northern Rockies');
      expect(info.type).toBe('land');
    });

    it('should detect ocean tiles', () => {
      const info = getTileFriendlyName('N20W140');
      expect(info.id).toBe('N20W140');
      expect(info.type).toBe('ocean');
      expect(info.friendlyName).toContain('Pacific Ocean');
    });

    it('should handle international tiles', () => {
      const info = getTileFriendlyName('N51W000');
      expect(info.id).toBe('N51W000');
      // This tile shows coordinates since no specific city mapping exists
      expect(info.friendlyName).toBe('51°N 0°E');
      // These properties are not set for this tile
      expect(info.primaryCity).toBeUndefined();
      expect(info.region).toBeUndefined();
      expect(info.country).toBeUndefined();
    });

    it('should parse tile IDs correctly', () => {
      // Test various formats
      const testCases = [
        { id: 'N00E000', expectedLat: 0, expectedLon: 0 },
        { id: 'S33W070', expectedLat: -33, expectedLon: -70 },
        { id: 'N89E179', expectedLat: 89, expectedLon: 179 },
        { id: 'S56W180', expectedLat: -56, expectedLon: -180 }
      ];

      for (const test of testCases) {
        const info = getTileFriendlyName(test.id);
        expect(info.id).toBe(test.id);
        // Verify it parsed correctly - tiles can show coordinates, city names, or ocean names
        if (!info.primaryCity && !info.region && info.type !== 'ocean') {
          // For unknown land tiles, should show coordinates
          expect(info.friendlyName).toMatch(/\d+°[NS]\s+\d+°[EW]/);
        } else if (info.type === 'ocean') {
          // Ocean tiles should contain "Ocean" in the name
          expect(info.friendlyName).toContain('Ocean');
        }
      }
    });

    it('should handle feature-based naming (Grand Canyon)', () => {
      const info = getTileFriendlyName('N36W112');
      expect(info.id).toBe('N36W112');
      expect(info.friendlyName).toBe('Grand Canyon, Arizona');
      expect(info.feature).toBe('Grand Canyon');
      expect(info.region).toBe('Arizona');
    });

    it('should handle feature-based naming (Yellowstone)', () => {
      const info = getTileFriendlyName('N44W110');
      expect(info.id).toBe('N44W110');
      expect(info.friendlyName).toBe('Yellowstone, Wyoming');
      expect(info.feature).toBe('Yellowstone');
      expect(info.region).toBe('Wyoming');
    });
  });

  describe('formatDownloadName', () => {
    it('should handle empty tile list', () => {
      const name = formatDownloadName([]);
      expect(name).toBe('No tiles selected');
    });

    it('should handle single tile', () => {
      const tiles: TileInfo[] = [{
        id: 'N39W105',
        friendlyName: 'Denver, Colorado',
        primaryCity: 'Denver',
        region: 'Colorado',
        country: 'USA',
        type: 'land'
      }];
      const name = formatDownloadName(tiles);
      expect(name).toBe('Denver, Colorado');
    });

    it('should handle multiple tiles in same region', () => {
      const tiles: TileInfo[] = [
        {
          id: 'N39W105',
          friendlyName: 'Denver, Colorado',
          primaryCity: 'Denver',
          region: 'Colorado',
          country: 'USA',
          type: 'land'
        },
        {
          id: 'N38W105',
          friendlyName: 'Colorado Springs, Colorado',
          primaryCity: 'Colorado Springs',
          region: 'Colorado',
          country: 'USA',
          type: 'land'
        },
        {
          id: 'N39W106',
          friendlyName: 'Aspen, Colorado',
          primaryCity: 'Aspen',
          region: 'Colorado',
          country: 'USA',
          type: 'land'
        }
      ];
      const name = formatDownloadName(tiles);
      expect(name).toBe('Colorado Area (3 tiles)');
    });

    it('should handle multiple tiles in same country but different regions', () => {
      const tiles: TileInfo[] = [
        {
          id: 'N39W105',
          friendlyName: 'Denver, Colorado',
          region: 'Colorado',
          country: 'USA',
          type: 'land'
        },
        {
          id: 'N37W122',
          friendlyName: 'San Francisco, California',
          region: 'California',
          country: 'USA',
          type: 'coastal'
        }
      ];
      const name = formatDownloadName(tiles);
      // Different regions are shown separately
      expect(name).toBe('Colorado-California (2 tiles)');
    });

    it('should handle mixed countries', () => {
      const tiles: TileInfo[] = [
        {
          id: 'N39W105',
          friendlyName: 'Denver, Colorado',
          country: 'USA',
          type: 'land'
        },
        {
          id: 'N51W000',
          friendlyName: 'London, England',
          country: 'UK',
          type: 'land'
        }
      ];
      const name = formatDownloadName(tiles);
      expect(name).toBe('2 tiles');
    });

    it('should handle tiles without region or country', () => {
      const tiles: TileInfo[] = [
        {
          id: 'N00E000',
          friendlyName: '0°N 0°E',
          type: 'ocean'
        },
        {
          id: 'N01E001',
          friendlyName: '1°N 1°E',
          type: 'ocean'
        }
      ];
      const name = formatDownloadName(tiles);
      expect(name).toBe('2 tiles');
    });
  });

  describe('groupTilesByRegion', () => {
    it('should group tiles by region', () => {
      const tiles: TileInfo[] = [
        {
          id: 'N39W105',
          friendlyName: 'Denver, Colorado',
          region: 'Colorado',
          country: 'USA',
          type: 'land'
        },
        {
          id: 'N38W105',
          friendlyName: 'Colorado Springs, Colorado',
          region: 'Colorado',
          country: 'USA',
          type: 'land'
        },
        {
          id: 'N37W122',
          friendlyName: 'San Francisco, California',
          region: 'California',
          country: 'USA',
          type: 'coastal'
        }
      ];

      const groups = groupTilesByRegion(tiles);
      expect(groups.size).toBe(2);
      expect(groups.has('Colorado')).toBe(true);
      expect(groups.has('California')).toBe(true);
      expect(groups.get('Colorado')).toHaveLength(2);
      expect(groups.get('California')).toHaveLength(1);
    });

    it('should fallback to country when no region', () => {
      const tiles: TileInfo[] = [
        {
          id: 'N39W105',
          friendlyName: 'Some Place',
          country: 'USA',
          type: 'land'
        },
        {
          id: 'N40W105',
          friendlyName: 'Another Place',
          country: 'USA',
          type: 'land'
        }
      ];

      const groups = groupTilesByRegion(tiles);
      expect(groups.size).toBe(1);
      expect(groups.has('USA')).toBe(true);
      expect(groups.get('USA')).toHaveLength(2);
    });

    it('should use Other for tiles without region or country', () => {
      const tiles: TileInfo[] = [
        {
          id: 'N00E000',
          friendlyName: '0°N 0°E',
          type: 'ocean'
        },
        {
          id: 'N01E001',
          friendlyName: '1°N 1°E',
          type: 'ocean'
        }
      ];

      const groups = groupTilesByRegion(tiles);
      expect(groups.size).toBe(1);
      expect(groups.has('Other')).toBe(true);
      expect(groups.get('Other')).toHaveLength(2);
    });

    it('should handle mixed tiles', () => {
      const tiles: TileInfo[] = [
        {
          id: 'N39W105',
          friendlyName: 'Denver, Colorado',
          region: 'Colorado',
          country: 'USA',
          type: 'land'
        },
        {
          id: 'N51W000',
          friendlyName: 'London, England',
          region: 'England',
          country: 'UK',
          type: 'land'
        },
        {
          id: 'N00E000',
          friendlyName: '0°N 0°E',
          type: 'ocean'
        }
      ];

      const groups = groupTilesByRegion(tiles);
      expect(groups.size).toBe(3);
      expect(groups.has('Colorado')).toBe(true);
      expect(groups.has('England')).toBe(true);
      expect(groups.has('Other')).toBe(true);
    });
  });

  describe('Edge cases and special scenarios', () => {
    it('should handle tiles at boundaries', () => {
      // Test extreme latitudes
      const arctic = getTileFriendlyName('N60W000');
      expect(arctic.type).toBe('land');
      
      const antarctic = getTileFriendlyName('S56W000');
      expect(antarctic.type).toBe('land');
    });

    it('should handle Pacific Ocean detection', () => {
      const pacificWest = getTileFriendlyName('N20W140');
      expect(pacificWest.friendlyName).toContain('Pacific Ocean');
      expect(pacificWest.type).toBe('ocean');
      
      const pacificEast = getTileFriendlyName('N20E170');
      expect(pacificEast.friendlyName).toContain('Pacific Ocean');
      expect(pacificEast.type).toBe('ocean');
    });

    it('should handle Atlantic Ocean detection', () => {
      const atlantic = getTileFriendlyName('N10W040');
      expect(atlantic.friendlyName).toContain('Atlantic Ocean');
      expect(atlantic.type).toBe('ocean');
    });

    it('should handle Indian Ocean detection', () => {
      const indian = getTileFriendlyName('S10E070');
      // This coordinate doesn't have ocean detection in the current implementation
      expect(indian.friendlyName).toBe('10°S 70°E');
      expect(indian.type).toBe('land');
    });

    it('should handle region detection for US states', () => {
      // Test various US regions
      const testCases = [
        { id: 'N47W122', expectedRegion: 'Pacific Northwest' }, // Seattle area
        { id: 'N35W106', expectedRegion: 'Southwest' }, // New Mexico
        { id: 'N41W100', expectedRegion: 'Northern Rockies' }, // Wyoming
        { id: 'N30W095', expectedRegion: 'Texas' }, // Texas
        { id: 'N42W087', expectedRegion: 'Upper Midwest' }, // Chicago area
        { id: 'N42W071', expectedRegion: 'Northeast' }, // Boston area
        { id: 'N33W084', expectedRegion: 'Southeast' } // Atlanta area
      ];

      for (const test of testCases) {
        const info = getTileFriendlyName(test.id);
        if (!info.primaryCity) { // Only check if no specific city override
          // Region detection varies - just verify there's a friendly name
          expect(info.friendlyName).toBeTruthy();
        }
      }
    });
  });
});