import { describe, it, expect, beforeEach } from 'vitest';
import {
  BoundingBox,
  TileId,
  SelectionState,
  boundingBoxToTiles,
  formatTileId,
  calculateAreaKm2,
  calculateDownloadSize,
  SelectionStore,
  createSelectionOverlay,
  createTileOverlay
} from '../../src/lib/selection-system';

describe('Selection System', () => {
  describe('formatTileId', () => {
    it('should format positive coordinates correctly', () => {
      expect(formatTileId(38, -105)).toBe('N38W105');
      expect(formatTileId(45, 123)).toBe('N45E123');
      expect(formatTileId(0, 0)).toBe('N00E000');
    });

    it('should format negative coordinates correctly', () => {
      expect(formatTileId(-33, -70)).toBe('S33W070');
      expect(formatTileId(-45, 170)).toBe('S45E170');
    });

    it('should pad coordinates with zeros', () => {
      expect(formatTileId(5, 5)).toBe('N05E005');
      expect(formatTileId(-9, -9)).toBe('S09W009');
    });
  });

  describe('boundingBoxToTiles', () => {
    it('should return empty array for invalid bounds', () => {
      const invalidBounds: BoundingBox = {
        north: 38,
        south: 40, // South > North
        east: -104,
        west: -106
      };
      expect(boundingBoxToTiles(invalidBounds)).toEqual([]);
    });

    it('should return single tile for bounds within one tile', () => {
      const bounds: BoundingBox = {
        north: 38.5,
        south: 38.1,
        east: -104.1,
        west: -104.9
      };
      const tiles = boundingBoxToTiles(bounds);
      expect(tiles).toHaveLength(1);
      expect(tiles[0].id).toBe('N38W105');
      expect(tiles[0].lat).toBe(38);
      expect(tiles[0].lon).toBe(-105);
    });

    it('should return multiple tiles for bounds spanning multiple degrees', () => {
      const bounds: BoundingBox = {
        north: 40,
        south: 38,
        east: -104,
        west: -106
      };
      const tiles = boundingBoxToTiles(bounds);
      expect(tiles).toHaveLength(9); // 3x3 grid
      
      const tileIds = tiles.map(t => t.id);
      expect(tileIds).toContain('N38W106');
      expect(tileIds).toContain('N39W105');
      expect(tileIds).toContain('N40W104');
    });

    it('should respect SRTM coverage limits (-56 to +60)', () => {
      const bounds: BoundingBox = {
        north: 70, // Beyond SRTM coverage
        south: -60, // Beyond SRTM coverage
        east: 0,
        west: -1
      };
      const tiles = boundingBoxToTiles(bounds);
      
      // Should clip to valid range
      const lats = tiles.map(t => t.lat);
      expect(Math.max(...lats)).toBeLessThanOrEqual(59);
      expect(Math.min(...lats)).toBeGreaterThanOrEqual(-56);
    });

    it('should handle bounds crossing the antimeridian', () => {
      const bounds: BoundingBox = {
        north: 1,
        south: -1,
        east: -179,
        west: 179
      };
      const tiles = boundingBoxToTiles(bounds);
      expect(tiles.length).toBeGreaterThan(0);
      
      // Should include tiles on both sides
      const lons = tiles.map(t => t.lon);
      expect(lons.some(lon => lon > 0)).toBe(true);
      expect(lons.some(lon => lon < 0)).toBe(true);
    });
  });

  describe('calculateAreaKm2', () => {
    it('should return 0 for invalid bounds', () => {
      expect(calculateAreaKm2(null as any)).toBe(0);
    });

    it('should calculate area correctly for small bounds', () => {
      const bounds: BoundingBox = {
        north: 39,
        south: 38,
        east: -104,
        west: -105
      };
      // 1 degree x 1 degree at ~38.5° latitude
      // Expected: ~9,500 km² (approximate)
      const area = calculateAreaKm2(bounds);
      expect(area).toBeGreaterThan(9000);
      expect(area).toBeLessThan(10000);
    });

    it('should calculate area correctly at equator', () => {
      const bounds: BoundingBox = {
        north: 1,
        south: -1,
        east: 1,
        west: -1
      };
      // 2 degrees x 2 degrees at equator
      // Expected: ~49,400 km² (111.32 km per degree at equator)
      const area = calculateAreaKm2(bounds);
      expect(area).toBeGreaterThan(49000);
      expect(area).toBeLessThan(50000);
    });
  });

  describe('calculateDownloadSize', () => {
    it('should calculate size based on tile count', () => {
      expect(calculateDownloadSize(0)).toBe(0);
      expect(calculateDownloadSize(1)).toBe(6.5 * 1024 * 1024);
      expect(calculateDownloadSize(10)).toBe(10 * 6.5 * 1024 * 1024);
    });
  });

  describe('SelectionStore', () => {
    let store: SelectionStore;

    beforeEach(() => {
      store = new SelectionStore();
    });

    it('should initialize with empty state', () => {
      const state = store.getState();
      expect(state.selectedArea).toBeNull();
      expect(state.requiredTiles).toEqual([]);
      expect(state.totalTiles).toBe(0);
      expect(state.downloadSize).toBe(0);
    });

    it('should select an area and compute tiles', () => {
      const bounds: BoundingBox = {
        north: 39,
        south: 38,
        east: -104,
        west: -105
      };

      store.selectArea(bounds);
      const state = store.getState();

      expect(state.selectedArea).toEqual(bounds);
      expect(state.requiredTiles).toHaveLength(4); // 2x2 grid
      expect(state.totalTiles).toBe(4);
      expect(state.downloadSize).toBe(4 * 6.5 * 1024 * 1024);
      expect(state.areaSquareKm).toBeGreaterThan(0);
    });

    it('should replace selection when selecting new area', () => {
      const bounds1: BoundingBox = {
        north: 39,
        south: 38,
        east: -104,
        west: -105
      };

      const bounds2: BoundingBox = {
        north: 41,
        south: 40,
        east: -102,
        west: -103
      };

      store.selectArea(bounds1);
      let state = store.getState();
      expect(state.totalTiles).toBe(4);

      store.selectArea(bounds2);
      state = store.getState();
      expect(state.totalTiles).toBe(4); // Still 4, not 8
      expect(state.selectedArea).toEqual(bounds2);
    });

    it('should clear selection', () => {
      const bounds: BoundingBox = {
        north: 39,
        south: 38,
        east: -104,
        west: -105
      };

      store.selectArea(bounds);
      store.clearSelection();
      const state = store.getState();

      expect(state.selectedArea).toBeNull();
      expect(state.requiredTiles).toEqual([]);
      expect(state.totalTiles).toBe(0);
    });

    it('should identify cached tiles', () => {
      const cachedTiles = ['N38W105', 'N39W105'];
      store = new SelectionStore(cachedTiles);

      const bounds: BoundingBox = {
        north: 39,
        south: 38,
        east: -104,
        west: -105
      };

      store.selectArea(bounds);
      const state = store.getState();

      expect(state.cachedTiles.size).toBe(2);
      expect(state.cachedTiles.has('N38W105')).toBe(true);
      expect(state.cachedTiles.has('N39W105')).toBe(true);
      expect(state.newTiles.size).toBe(2);
      expect(state.downloadSize).toBe(2 * 6.5 * 1024 * 1024); // Only new tiles count
    });

    it('should notify subscribers on state change', () => {
      let notificationCount = 0;
      let lastState: SelectionState | null = null;

      const unsubscribe = store.subscribe((state) => {
        notificationCount++;
        lastState = state;
      });

      const bounds: BoundingBox = {
        north: 39,
        south: 38,
        east: -104,
        west: -105
      };

      store.selectArea(bounds);
      expect(notificationCount).toBe(1);
      expect(lastState!.totalTiles).toBe(4);

      store.clearSelection();
      expect(notificationCount).toBe(2);
      expect(lastState!.totalTiles).toBe(0);

      unsubscribe();
      store.selectArea(bounds);
      expect(notificationCount).toBe(2); // Should not increase after unsubscribe
    });

    it('should update cached tiles', () => {
      const bounds: BoundingBox = {
        north: 39,
        south: 38,
        east: -104,
        west: -105
      };

      store.selectArea(bounds);
      let state = store.getState();
      expect(state.newTiles.size).toBe(4);

      store.updateCachedTiles(['N38W105', 'N39W105']);
      state = store.getState();
      expect(state.cachedTiles.size).toBe(2);
      expect(state.newTiles.size).toBe(2);
      expect(state.downloadSize).toBe(2 * 6.5 * 1024 * 1024);
    });
  });

  describe('GeoJSON helpers', () => {
    it('should create selection overlay GeoJSON', () => {
      const bounds: BoundingBox = {
        north: 39,
        south: 38,
        east: -104,
        west: -105
      };

      const feature = createSelectionOverlay(bounds);
      expect(feature.type).toBe('Feature');
      expect(feature.geometry.type).toBe('Polygon');
      expect(feature.properties?.type).toBe('selection');
      
      const coords = (feature.geometry as any).coordinates[0];
      expect(coords).toHaveLength(5); // Closed polygon
      expect(coords[0]).toEqual([bounds.west, bounds.south]);
    });

    it('should create tile overlay GeoJSON', () => {
      const tiles: TileId[] = [
        { id: 'N38W105', lat: 38, lon: -105 },
        { id: 'N39W105', lat: 39, lon: -105 }
      ];
      const cached = new Set(['N38W105']);

      const collection = createTileOverlay(tiles, cached);
      expect(collection.type).toBe('FeatureCollection');
      expect(collection.features).toHaveLength(2);
      
      const cachedFeature = collection.features.find(f => f.properties?.id === 'N38W105');
      expect(cachedFeature?.properties?.cached).toBe(true);
      
      const newFeature = collection.features.find(f => f.properties?.id === 'N39W105');
      expect(newFeature?.properties?.cached).toBe(false);
    });
  });
});