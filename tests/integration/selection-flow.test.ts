import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SelectionStore,
  boundingBoxToTiles,
  calculateAreaKm2
} from '../../src/lib/selection-system';
import {
  getTileFriendlyName,
  formatDownloadName
} from '../../src/lib/tile-naming';

describe('Selection Flow Integration', () => {
  let store: SelectionStore;

  beforeEach(() => {
    store = new SelectionStore();
  });

  describe('Complete selection workflow', () => {
    it.skip('should handle Denver area selection end-to-end', () => {
      // 1. User draws selection box around Denver
      const denverBounds = {
        north: 40.0,
        south: 39.5,
        east: -104.8,
        west: -105.2
      };

      // 2. System converts bounds to tiles
      const tiles = boundingBoxToTiles(denverBounds);
      expect(tiles).toHaveLength(2); // Should be N39W105 and N39W106
      expect(tiles.some(t => t.id === 'N39W105')).toBe(true);
      expect(tiles.some(t => t.id === 'N39W106')).toBe(true);

      // 3. System gets friendly names for tiles
      const tilesWithNames = tiles.map(t => getTileFriendlyName(t.id));
      const denverTile = tilesWithNames.find(t => t.id === 'N39W105');
      expect(denverTile?.friendlyName).toBe('Denver, Colorado');
      expect(denverTile?.primaryCity).toBe('Denver');
      expect(denverTile?.region).toBe('Colorado');

      // 4. Store updates with selection
      store.selectArea(denverBounds);
      const state = store.getState();
      
      expect(state.selectedArea).toEqual(denverBounds);
      expect(state.totalTiles).toBe(2);
      expect(state.requiredTiles).toHaveLength(2);
      expect(state.friendlyDescription).toBe('Colorado Area (2 tiles)');
      
      // 5. Download filename is generated
      const filename = formatDownloadName(state.tilesWithNames);
      expect(filename).toBe('Colorado Area (2 tiles)');
    });

    it.skip('should handle multi-state selection', () => {
      // 1. User selects area spanning Colorado and Wyoming
      const multiStateBounds = {
        north: 42.0,
        south: 39.0,
        east: -104.0,
        west: -106.0
      };

      // 2. Convert to tiles
      const tiles = boundingBoxToTiles(multiStateBounds);
      expect(tiles.length).toBeGreaterThan(4);

      // 3. Update store
      store.selectArea(multiStateBounds);
      const state = store.getState();

      // 4. Check friendly description includes USA
      expect(state.friendlyDescription).toContain('USA');
      expect(state.friendlyDescription).toContain('tiles');
      
      // 5. Area calculation
      const area = calculateAreaKm2(multiStateBounds);
      expect(area).toBeGreaterThan(0);
      expect(state.areaSquareKm).toBeGreaterThan(0);
    });

    it.skip('should handle coastal selection', () => {
      // San Francisco Bay Area
      const sfBounds = {
        north: 38.0,
        south: 37.0,
        east: -122.0,
        west: -123.0
      };

      store.selectArea(sfBounds);
      const state = store.getState();

      // Should identify California tiles
      const sfTile = state.tilesWithNames.find(t => t.id === 'N37W122');
      expect(sfTile?.friendlyName).toBe('San Francisco, California');
      expect(sfTile?.type).toBe('coastal');
    });

    it.skip('should handle landmark-based selection', () => {
      // Grand Canyon area
      const grandCanyonBounds = {
        north: 36.5,
        south: 35.5,
        east: -111.5,
        west: -112.5
      };

      store.selectArea(grandCanyonBounds);
      const state = store.getState();

      // Should identify Grand Canyon
      const gcTile = state.tilesWithNames.find(t => t.id === 'N36W112');
      expect(gcTile?.friendlyName).toBe('Grand Canyon, Arizona');
      expect(gcTile?.feature).toBe('Grand Canyon');
    });

    it.skip('should update when selection changes', () => {
      // First selection
      const bounds1 = {
        north: 40.0,
        south: 39.0,
        east: -104.0,
        west: -105.0
      };

      store.selectArea(bounds1);
      let state = store.getState();
      const firstTileCount = state.totalTiles;

      // Second selection (replaces first)
      const bounds2 = {
        north: 38.0,
        south: 37.0,
        east: -122.0,
        west: -123.0
      };

      store.selectArea(bounds2);
      state = store.getState();
      
      // Should have different tiles
      expect(state.selectedArea).toEqual(bounds2);
      expect(state.totalTiles).not.toBe(firstTileCount);
      
      // Should have California naming
      expect(state.friendlyDescription).toContain('California');
    });

    it('should handle cache detection', () => {
      // Initialize with some cached tiles
      const cachedTiles = ['N39W105', 'N38W105'];
      store = new SelectionStore(cachedTiles);

      // Select area including cached tiles
      const bounds = {
        north: 40.0,
        south: 38.0,
        east: -104.0,
        west: -106.0
      };

      store.selectArea(bounds);
      const state = store.getState();

      // Should identify cached vs new tiles
      expect(state.cachedTiles.size).toBe(2);
      expect(state.cachedTiles.has('N39W105')).toBe(true);
      expect(state.cachedTiles.has('N38W105')).toBe(true);
      expect(state.newTiles.size).toBeGreaterThan(0);
      
      // Download size should only include new tiles
      const newTileCount = state.newTiles.size;
      expect(state.downloadSize).toBe(newTileCount * 6.5 * 1024 * 1024);
    });

    it('should clear selection properly', () => {
      // Make a selection
      const bounds = {
        north: 40.0,
        south: 39.0,
        east: -104.0,
        west: -105.0
      };

      store.selectArea(bounds);
      expect(store.getState().totalTiles).toBeGreaterThan(0);

      // Clear selection
      store.clearSelection();
      const state = store.getState();

      expect(state.selectedArea).toBeNull();
      expect(state.totalTiles).toBe(0);
      expect(state.requiredTiles).toEqual([]);
      expect(state.friendlyDescription).toBe('');
      expect(state.downloadSize).toBe(0);
    });

    it.skip('should handle international selections', () => {
      // Tokyo area
      const tokyoBounds = {
        north: 36.0,
        south: 35.0,
        east: 140.0,
        west: 139.0
      };

      store.selectArea(tokyoBounds);
      const state = store.getState();

      const tokyoTile = state.tilesWithNames.find(t => t.id === 'N35E139');
      expect(tokyoTile?.friendlyName).toBe('Tokyo, Japan');
      expect(tokyoTile?.country).toBe('Japan');
    });

    it.skip('should generate appropriate filenames', () => {
      const testCases = [
        {
          bounds: { north: 39.8, south: 39.6, east: -104.9, west: -105.1 },
          expectedPattern: /denver|colorado/i
        },
        {
          bounds: { north: 45.0, south: 40.0, east: -100.0, west: -110.0 },
          expectedPattern: /usa.*tiles/i
        },
        {
          bounds: { north: 36.2, south: 36.0, east: -111.9, west: -112.1 },
          expectedPattern: /grand.*canyon|arizona/i
        }
      ];

      for (const test of testCases) {
        store.selectArea(test.bounds);
        const state = store.getState();
        expect(state.friendlyDescription).toMatch(test.expectedPattern);
      }
    });

    it.skip('should handle edge cases', () => {
      // Empty selection
      store.selectArea({
        north: 40.0,
        south: 40.0,
        east: -105.0,
        west: -105.0
      });
      expect(store.getState().totalTiles).toBe(1); // Single point = 1 tile

      // Invalid bounds (south > north)
      const tiles = boundingBoxToTiles({
        north: 38.0,
        south: 40.0,
        east: -104.0,
        west: -105.0
      });
      expect(tiles).toEqual([]);

      // SRTM coverage limits
      store.selectArea({
        north: 70.0, // Beyond SRTM coverage
        south: -60.0, // Beyond SRTM coverage
        east: 0.0,
        west: -10.0
      });
      const state = store.getState();
      // Should clip to valid SRTM range
      const lats = state.requiredTiles.map(t => t.lat);
      expect(Math.max(...lats)).toBeLessThanOrEqual(59);
      expect(Math.min(...lats)).toBeGreaterThanOrEqual(-56);
    });
  });

  describe('State subscriptions', () => {
    it('should notify subscribers on changes', () => {
      const updates: any[] = [];
      const unsubscribe = store.subscribe(state => {
        updates.push({
          tiles: state.totalTiles,
          description: state.friendlyDescription
        });
      });

      // First selection
      store.selectArea({
        north: 40.0,
        south: 39.0,
        east: -104.0,
        west: -105.0
      });

      // Second selection
      store.selectArea({
        north: 38.0,
        south: 37.0,
        east: -122.0,
        west: -123.0
      });

      // Clear
      store.clearSelection();

      expect(updates).toHaveLength(3);
      expect(updates[0].tiles).toBeGreaterThan(0);
      expect(updates[1].tiles).toBeGreaterThan(0);
      expect(updates[2].tiles).toBe(0);

      unsubscribe();
      
      // No more updates after unsubscribe
      store.selectArea({
        north: 40.0,
        south: 39.0,
        east: -104.0,
        west: -105.0
      });
      expect(updates).toHaveLength(3);
    });
  });

  describe('Download size calculations', () => {
    it('should calculate correct download sizes', () => {
      const bounds = {
        north: 41.0,
        south: 39.0,
        east: -104.0,
        west: -106.0
      };

      store.selectArea(bounds);
      const state = store.getState();

      // Each tile is approximately 6.5 MB
      const expectedSize = state.totalTiles * 6.5 * 1024 * 1024;
      expect(state.downloadSize).toBe(expectedSize);
    });

    it('should exclude cached tiles from download size', () => {
      const cachedTiles = ['N40W105', 'N39W105'];
      store = new SelectionStore(cachedTiles);

      store.selectArea({
        north: 41.0,
        south: 39.0,
        east: -104.0,
        west: -106.0
      });

      const state = store.getState();
      const newTilesOnly = state.totalTiles - cachedTiles.length;
      const expectedSize = newTilesOnly * 6.5 * 1024 * 1024;
      expect(state.downloadSize).toBe(expectedSize);
    });
  });
});