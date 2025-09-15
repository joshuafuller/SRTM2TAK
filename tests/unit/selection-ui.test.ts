/**
 * Tests for SelectionUI to prevent regression of tile selection bugs
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import maplibregl from 'maplibre-gl';
import { SelectionUI } from '../../src/lib/selection-ui';
import { SelectionStore } from '../../src/lib/selection-system';

// Mock maplibre-gl
vi.mock('maplibre-gl');

describe('SelectionUI', () => {
  let map: any;
  let store: SelectionStore;
  let selectionUI: SelectionUI;
  let mapContainer: HTMLDivElement;
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    // Create mock DOM elements
    mapContainer = document.createElement('div');
    canvas = document.createElement('canvas');
    mapContainer.appendChild(canvas);
    document.body.appendChild(mapContainer);

    // Create mock map
    map = {
      getCanvas: vi.fn(() => canvas),
      getContainer: vi.fn(() => mapContainer),
      addSource: vi.fn(),
      addLayer: vi.fn(),
      getSource: vi.fn(() => ({
        setData: vi.fn()
      })),
      on: vi.fn(),
      off: vi.fn(),
      unproject: vi.fn((point: number[]) => ({
        lng: point[0] / 10,
        lat: point[1] / 10
      })),
      fitBounds: vi.fn(),
      dragPan: {
        enable: vi.fn(),
        disable: vi.fn()
      }
    };

    // Create store and UI
    store = new SelectionStore();
    selectionUI = new SelectionUI({
      map,
      selectionStore: store
    });
  });

  afterEach(() => {
    document.body.removeChild(mapContainer);
    vi.clearAllMocks();
  });

  describe('Area Selection Mode', () => {
    it('should enable area selection mode correctly', () => {
      selectionUI.startAreaSelection();

      // Should change cursor to crosshair
      expect(canvas.style.cursor).toBe('crosshair');

      // Should disable map panning
      expect(map.dragPan.disable).toHaveBeenCalled();

      // Should disable touch gestures to prevent pull-to-refresh
      expect(canvas.style.touchAction).toBe('none');

      // Should bind mouse events
      expect(map.on).toHaveBeenCalledWith('mousedown', expect.any(Function));
      expect(map.on).toHaveBeenCalledWith('mousemove', expect.any(Function));
      expect(map.on).toHaveBeenCalledWith('mouseup', expect.any(Function));

      // Should bind touch events
      expect(map.on).toHaveBeenCalledWith('touchstart', expect.any(Function));
      expect(map.on).toHaveBeenCalledWith('touchmove', expect.any(Function));
      expect(map.on).toHaveBeenCalledWith('touchend', expect.any(Function));
    });

    it('should disable area selection mode correctly', () => {
      // First enable
      selectionUI.startAreaSelection();

      // Then disable
      selectionUI.stopAreaSelection();

      // Should reset cursor
      expect(canvas.style.cursor).toBe('');

      // Should re-enable touch gestures
      expect(canvas.style.touchAction).toBe('');

      // Should re-enable map panning
      expect(map.dragPan.enable).toHaveBeenCalled();

      // Should unbind mouse events
      expect(map.off).toHaveBeenCalledWith('mousedown', expect.any(Function));
      expect(map.off).toHaveBeenCalledWith('mousemove', expect.any(Function));
      expect(map.off).toHaveBeenCalledWith('mouseup', expect.any(Function));

      // Should unbind touch events
      expect(map.off).toHaveBeenCalledWith('touchstart', expect.any(Function));
      expect(map.off).toHaveBeenCalledWith('touchmove', expect.any(Function));
      expect(map.off).toHaveBeenCalledWith('touchend', expect.any(Function));
    });
  });

  describe('Selection Box Drawing', () => {
    let mouseDownHandler: Function;
    let mouseMoveHandler: Function;
    let mouseUpHandler: Function;

    beforeEach(() => {
      // Capture event handlers
      map.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'mousedown' || event === 'touchstart') {
          mouseDownHandler = handler;
        } else if (event === 'mousemove' || event === 'touchmove') {
          mouseMoveHandler = handler;
        } else if (event === 'mouseup' || event === 'touchend') {
          mouseUpHandler = handler;
        }
      });

      selectionUI.startAreaSelection();
    });

    it('should not create selection for tiny movements (accidental clicks)', () => {
      const selectAreaSpy = vi.spyOn(store, 'selectArea');

      // Simulate tiny drag (less than minimum distance)
      const event1 = {
        point: { x: 100, y: 100 },
        preventDefault: vi.fn(),
        originalEvent: {
          preventDefault: vi.fn(),
          stopPropagation: vi.fn()
        }
      };

      const event2 = {
        point: { x: 102, y: 101 }, // Only 2-3 pixels movement
        preventDefault: vi.fn(),
        originalEvent: {
          preventDefault: vi.fn()
        }
      };

      mouseDownHandler(event1);
      mouseMoveHandler(event2);
      mouseUpHandler(event2);

      // Should NOT create a selection for tiny movements
      expect(selectAreaSpy).not.toHaveBeenCalled();
    });

    it('should create selection for valid drag operations', () => {
      const selectAreaSpy = vi.spyOn(store, 'selectArea');

      // Simulate proper drag
      const event1 = {
        point: { x: 100, y: 100 },
        preventDefault: vi.fn(),
        originalEvent: {
          preventDefault: vi.fn(),
          stopPropagation: vi.fn()
        }
      };

      const event2 = {
        point: { x: 150, y: 150 }, // 50 pixels movement
        preventDefault: vi.fn(),
        originalEvent: {
          preventDefault: vi.fn()
        }
      };

      const event3 = {
        point: { x: 200, y: 200 }, // Final position
        preventDefault: vi.fn()
      };

      mouseDownHandler(event1);
      mouseMoveHandler(event2);
      mouseUpHandler(event3);

      // Should create a selection
      expect(selectAreaSpy).toHaveBeenCalledWith(expect.objectContaining({
        north: expect.any(Number),
        south: expect.any(Number),
        east: expect.any(Number),
        west: expect.any(Number)
      }));
    });

    it('should create and update selection box element during drag', () => {
      const event1 = {
        point: { x: 100, y: 100 },
        preventDefault: vi.fn(),
        originalEvent: {
          preventDefault: vi.fn(),
          stopPropagation: vi.fn()
        }
      };

      const event2 = {
        point: { x: 200, y: 150 },
        preventDefault: vi.fn(),
        originalEvent: {
          preventDefault: vi.fn()
        }
      };

      // Start drag
      mouseDownHandler(event1);

      // Should create selection box
      const selectionBox = mapContainer.querySelector('.selection-box') as HTMLDivElement;
      expect(selectionBox).toBeTruthy();
      expect(selectionBox.style.position).toBe('absolute');

      // Move mouse
      mouseMoveHandler(event2);

      // Should update box dimensions
      expect(selectionBox.style.left).toBe('100px');
      expect(selectionBox.style.top).toBe('100px');
      expect(selectionBox.style.width).toBe('100px');
      expect(selectionBox.style.height).toBe('50px');

      // End drag
      mouseUpHandler(event2);

      // Should remove selection box
      expect(mapContainer.querySelector('.selection-box')).toBeFalsy();
    });

    it('should prevent default touch behavior to avoid pull-to-refresh', () => {
      const event = {
        point: { x: 100, y: 100 },
        preventDefault: vi.fn(),
        originalEvent: {
          preventDefault: vi.fn(),
          stopPropagation: vi.fn()
        }
      };

      mouseDownHandler(event);

      // Should prevent default on the event
      expect(event.preventDefault).toHaveBeenCalled();
      expect(event.originalEvent.preventDefault).toHaveBeenCalled();
      expect(event.originalEvent.stopPropagation).toHaveBeenCalled();
    });
  });

  describe('No Tile Click Selection', () => {
    it('should not have any tile click handlers', () => {
      // Ensure no click handlers are registered for tiles
      const onCalls = map.on.mock.calls;

      // Should not have any 'click' event handlers for tile selection
      const hasClickHandler = onCalls.some(
        ([event]: [string]) => event === 'click'
      );

      expect(hasClickHandler).toBe(false);
    });

    it('should only select tiles through area selection', () => {
      const selectAreaSpy = vi.spyOn(store, 'selectArea');

      // Enable selection mode
      selectionUI.startAreaSelection();

      // Capture handlers
      let mouseDownHandler: Function;
      let mouseUpHandler: Function;

      map.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'mousedown' || event === 'touchstart') {
          mouseDownHandler = handler;
        } else if (event === 'mouseup' || event === 'touchend') {
          mouseUpHandler = handler;
        }
      });

      selectionUI.startAreaSelection();

      // Simulate valid drag selection
      const startEvent = {
        point: { x: 100, y: 100 },
        preventDefault: vi.fn(),
        originalEvent: {
          preventDefault: vi.fn(),
          stopPropagation: vi.fn()
        }
      };

      const endEvent = {
        point: { x: 300, y: 300 },
        preventDefault: vi.fn()
      };

      mouseDownHandler!(startEvent);
      mouseUpHandler!(endEvent);

      // Should call selectArea with bounds
      expect(selectAreaSpy).toHaveBeenCalledWith(expect.objectContaining({
        north: expect.any(Number),
        south: expect.any(Number),
        east: expect.any(Number),
        west: expect.any(Number)
      }));
    });
  });

  describe('Touch Screen Support', () => {
    it('should handle touch events the same as mouse events', () => {
      let touchStartHandler: Function;
      let touchMoveHandler: Function;
      let touchEndHandler: Function;

      map.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'touchstart') {
          touchStartHandler = handler;
        } else if (event === 'touchmove') {
          touchMoveHandler = handler;
        } else if (event === 'touchend') {
          touchEndHandler = handler;
        }
      });

      selectionUI.startAreaSelection();

      const selectAreaSpy = vi.spyOn(store, 'selectArea');

      // Simulate touch drag
      const touchStart = {
        point: { x: 100, y: 100 },
        preventDefault: vi.fn(),
        originalEvent: {
          preventDefault: vi.fn(),
          stopPropagation: vi.fn()
        }
      };

      const touchMove = {
        point: { x: 200, y: 200 },
        preventDefault: vi.fn(),
        originalEvent: {
          preventDefault: vi.fn()
        }
      };

      const touchEnd = {
        point: { x: 250, y: 250 },
        preventDefault: vi.fn()
      };

      touchStartHandler!(touchStart);
      touchMoveHandler!(touchMove);
      touchEndHandler!(touchEnd);

      // Should create selection from touch events
      expect(selectAreaSpy).toHaveBeenCalledWith(expect.objectContaining({
        north: expect.any(Number),
        south: expect.any(Number),
        east: expect.any(Number),
        west: expect.any(Number)
      }));
    });

    it('should disable pull-to-refresh during selection mode', () => {
      selectionUI.startAreaSelection();

      // Canvas should have touch-action: none
      expect(canvas.style.touchAction).toBe('none');

      selectionUI.stopAreaSelection();

      // Should reset touch-action
      expect(canvas.style.touchAction).toBe('');
    });
  });

  describe('Clear Selection', () => {
    it('should clear selection when clearSelection is called', () => {
      const clearSpy = vi.spyOn(store, 'clearSelection');

      selectionUI.clearSelection();

      expect(clearSpy).toHaveBeenCalled();
    });
  });

  describe('Fit to Selection', () => {
    it('should fit map bounds to current selection', () => {
      // Set a selection in the store
      store.selectArea({
        north: 40,
        south: 30,
        east: -70,
        west: -80
      });

      selectionUI.fitToSelection();

      expect(map.fitBounds).toHaveBeenCalledWith(
        [[-80, 30], [-70, 40]],
        { padding: 50, duration: 500 }
      );
    });

    it('should not fit bounds if no selection exists', () => {
      selectionUI.fitToSelection();

      expect(map.fitBounds).not.toHaveBeenCalled();
    });
  });
});