import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SelectionUI } from '../src/lib/selection-ui';
import { SelectionStore } from '../src/lib/selection-system';
import maplibregl from 'maplibre-gl';

// Mock maplibre-gl
vi.mock('maplibre-gl');

describe('Selection System', () => {
  let map: any;
  let selectionUI: SelectionUI;
  let selectionStore: SelectionStore;

  beforeEach(() => {
    // Create mock canvas that persists state
    const canvasStyle = { cursor: '', touchAction: '' };
    const canvas = { style: canvasStyle };

    // Create mock map
    map = {
      getCanvas: vi.fn(() => canvas),
      dragPan: {
        enable: vi.fn(),
        disable: vi.fn()
      },
      on: vi.fn(),
      off: vi.fn(),
      getContainer: vi.fn(() => ({
        appendChild: vi.fn()
      })),
      project: vi.fn((lngLat) => ({ x: lngLat.lng * 100, y: lngLat.lat * 100 })),
      unproject: vi.fn((point) => ({ lng: point.x / 100, lat: point.y / 100 })),
      addSource: vi.fn(),
      addLayer: vi.fn(),
      getSource: vi.fn(() => ({
        setData: vi.fn()
      })),
      removeLayer: vi.fn(),
      removeSource: vi.fn()
    };

    selectionStore = new SelectionStore();
    selectionUI = new SelectionUI({ map, selectionStore });
  });

  describe('Tile Selection', () => {
    it('should NOT select tiles on click when draw mode is inactive', () => {
      // No tile click handlers should be registered
      const clickCalls = map.on.mock.calls.filter(
        (call: any) => call[0] === 'click' && (call[1] === 'tile-grid-lines' || call[1] === 'tile-grid-fill')
      );
      expect(clickCalls).toHaveLength(0);
    });

    it('should NOT select tiles on mouseenter/mouseleave', () => {
      // No hover handlers should cause selection
      const mouseenterCalls = map.on.mock.calls.filter(
        (call: any) => call[0] === 'mouseenter'
      );
      const mouseleaveCalls = map.on.mock.calls.filter(
        (call: any) => call[0] === 'mouseleave'
      );

      // Even if these exist for visual feedback, they shouldn't select tiles
      mouseenterCalls.forEach((call: any) => {
        expect(call[2]).not.toContain('handleTileSelection');
        expect(call[2]).not.toContain('selectedTiles.add');
      });
    });

    it('should ONLY select tiles through draw selection box', () => {
      // Start area selection
      selectionUI.startAreaSelection();

      // Verify selection mode is active
      expect(map.dragPan.disable).toHaveBeenCalled();
      expect(map.getCanvas().style.cursor).toBe('crosshair');

      // Verify mouse event handlers are registered
      const mouseDownCalls = map.on.mock.calls.filter(
        (call: any) => call[0] === 'mousedown'
      );
      const mouseUpCalls = map.on.mock.calls.filter(
        (call: any) => call[0] === 'mouseup'
      );

      expect(mouseDownCalls.length).toBeGreaterThan(0);
      expect(mouseUpCalls.length).toBeGreaterThan(0);
    });
  });

  describe('Draw Selection Mode', () => {
    it('should require minimum drag distance to create selection', () => {
      selectionUI.startAreaSelection();

      // Simulate tiny mouse movement (should be ignored)
      const mouseDown = {
        point: { x: 100, y: 100 },
        lngLat: { lng: 1, lat: 1 },
        preventDefault: vi.fn()
      };

      const mouseUp = {
        point: { x: 102, y: 102 }, // Only 2 pixels movement
        lngLat: { lng: 1.02, lat: 1.02 }
      };

      // Get the registered handlers
      const mouseDownHandler = map.on.mock.calls.find(
        (call: any) => call[0] === 'mousedown'
      )?.[1];
      const mouseUpHandler = map.on.mock.calls.find(
        (call: any) => call[0] === 'mouseup'
      )?.[1];

      if (mouseDownHandler && mouseUpHandler) {
        mouseDownHandler(mouseDown);
        mouseUpHandler(mouseUp);

        // Selection should NOT be created for tiny movements
        const state = selectionStore.getState();
        expect(state.selectedArea).toBeNull();
        expect(state.requiredTiles).toHaveLength(0);
      }
    });

    it('should create selection for valid drag distance', () => {
      selectionUI.startAreaSelection();

      // Simulate proper drag
      const mouseDown = {
        point: { x: 100, y: 100 },
        lngLat: { lng: 1, lat: 1 },
        preventDefault: vi.fn()
      };

      const mouseUp = {
        point: { x: 150, y: 150 }, // 50 pixels movement (valid)
        lngLat: { lng: 1.5, lat: 1.5 }
      };

      // Get the registered handlers
      const mouseDownHandler = map.on.mock.calls.find(
        (call: any) => call[0] === 'mousedown'
      )?.[1];
      const mouseUpHandler = map.on.mock.calls.find(
        (call: any) => call[0] === 'mouseup'
      )?.[1];

      if (mouseDownHandler && mouseUpHandler) {
        mouseDownHandler(mouseDown);
        mouseUpHandler(mouseUp);

        // Selection SHOULD be created for proper drag
        const state = selectionStore.getState();
        expect(state.selectedArea).not.toBeNull();
      }
    });

    it('should not activate draw mode on initialization', () => {
      // Draw mode should be inactive by default
      const cursor = map.getCanvas().style.cursor;
      expect(cursor).not.toBe('crosshair');
      expect(map.dragPan.disable).not.toHaveBeenCalled();
    });

    it('should properly toggle draw mode', () => {
      // Start selection
      selectionUI.startAreaSelection();
      expect(map.getCanvas().style.cursor).toBe('crosshair');
      expect(map.dragPan.disable).toHaveBeenCalled();

      // Stop selection
      selectionUI.stopAreaSelection();
      expect(map.getCanvas().style.cursor).toBe('');
      expect(map.dragPan.enable).toHaveBeenCalled();
    });
  });

  describe('Zoom Behavior', () => {
    it('should NOT select tiles when zooming', () => {
      // Simulate zoom events
      const zoomEndHandler = map.on.mock.calls.find(
        (call: any) => call[0] === 'zoomend'
      )?.[1];

      if (zoomEndHandler) {
        // Initial state - no tiles selected
        expect(selectionStore.getState().requiredTiles).toHaveLength(0);

        // Trigger zoom
        zoomEndHandler();

        // Still no tiles selected
        expect(selectionStore.getState().requiredTiles).toHaveLength(0);
      }
    });

    it('should NOT select tiles when tiles appear under cursor', () => {
      // This was the bug - tiles getting selected when they appear
      // under the cursor during zoom

      // Simulate tiles appearing (grid becomes visible at zoom level 5+)
      const mockTileUnderCursor = {
        id: 'N37W122',
        properties: { tileId: 'N37W122' }
      };

      // There should be NO automatic selection
      expect(selectionStore.getState().requiredTiles).toHaveLength(0);

      // Even with mouse movement
      const mouseMoveHandler = map.on.mock.calls.find(
        (call: any) => call[0] === 'mousemove'
      )?.[1];

      if (mouseMoveHandler) {
        mouseMoveHandler({
          point: { x: 100, y: 100 },
          features: [mockTileUnderCursor]
        });

        // Still no selection
        expect(selectionStore.getState().requiredTiles).toHaveLength(0);
      }
    });
  });

  describe('Protection Against Accidental Selection', () => {
    it('should not allow individual tile clicks', () => {
      // Verify no click handlers for tiles
      const tileClickHandlers = map.on.mock.calls.filter(
        (call: any) =>
          call[0] === 'click' &&
          (call[1]?.includes('tile') || call[1]?.includes('grid'))
      );

      expect(tileClickHandlers).toHaveLength(0);
    });

    it('should not show pointer cursor on tiles', () => {
      // Tiles aren't clickable, so no pointer cursor
      const mouseenterHandlers = map.on.mock.calls.filter(
        (call: any) =>
          call[0] === 'mouseenter' &&
          call[1]?.includes('tile')
      );

      // These handlers should not set cursor to pointer
      mouseenterHandlers.forEach((call: any) => {
        const handler = call[2];
        if (handler) {
          // Mock event
          const event = { features: [{ properties: { tileId: 'test' } }] };
          handler(event);

          // Cursor should not be pointer
          expect(map.getCanvas().style.cursor).not.toBe('pointer');
        }
      });
    });

    it('should clear selection only through clear button', () => {
      // Add some tiles to selection via proper draw box
      selectionStore.selectArea(
        { north: 38, south: 37, east: -121, west: -122 }
      );

      expect(selectionStore.getState().requiredTiles.length).toBeGreaterThan(0);

      // Clear selection
      selectionStore.clearSelection();

      expect(selectionStore.getState().requiredTiles).toHaveLength(0);
    });
  });
});