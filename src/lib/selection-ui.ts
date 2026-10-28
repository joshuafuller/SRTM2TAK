/**
 * Area-Based Selection UI
 *
 * Integrates the selection system with a Leaflet map. Leaflet draws with
 * plain DOM and canvas, so no WebGL is needed.
 */

import * as L from 'leaflet';
import { SelectionStore, SelectionState, BoundingBox, createSelectionOverlay, createTileOverlay } from './selection-system';

export interface SelectionUIOptions {
  map: L.Map;
  selectionStore: SelectionStore;
  onSelectionChange?: (state: SelectionState) => void;
}

export class SelectionUI {
  private map: L.Map;
  private store: SelectionStore;
  private isDrawing = false;
  private startPoint: L.Point | null = null;
  private currentBox: HTMLDivElement | null = null;
  private areaLayer: L.GeoJSON;
  private tilesLayer: L.GeoJSON;

  constructor(options: SelectionUIOptions) {
    this.map = options.map;
    this.store = options.selectionStore;

    // Subscribe to store changes
    if (options.onSelectionChange) {
      this.store.subscribe(options.onSelectionChange);
    }

    // Tile overlay underneath the selection area outline
    this.tilesLayer = L.geoJSON(undefined, {
      interactive: false,
      style: (feature) => {
        const color = feature?.properties?.cached ? '#4CAF50' : '#2196F3';
        return { color, weight: 2, opacity: 0.8, fillColor: color, fillOpacity: 0.3 };
      },
    }).addTo(this.map);

    this.areaLayer = L.geoJSON(undefined, {
      interactive: false,
      style: { color: '#FF9800', weight: 3, dashArray: '6 6', fillColor: '#FF9800', fillOpacity: 0.1 },
    }).addTo(this.map);

    // Store changes update visualization
    this.store.subscribe((state) => this.updateVisualization(state));
  }

  /**
   * Enable area selection mode
   */
  public startAreaSelection(): void {
    const container = this.map.getContainer();
    container.style.cursor = 'crosshair';
    // Prevent pull-to-refresh and other touch gestures
    container.style.touchAction = 'none';

    // Disable map panning so a drag draws a box
    this.map.dragging.disable();

    // Pointer events cover mouse, touch and pen
    container.addEventListener('pointerdown', this.onPointerDown);
    container.addEventListener('pointermove', this.onPointerMove);
    container.addEventListener('pointerup', this.onPointerUp);
    container.addEventListener('pointercancel', this.onPointerCancel);
  }

  /**
   * Disable area selection mode
   */
  public stopAreaSelection(): void {
    const container = this.map.getContainer();
    container.style.cursor = '';
    container.style.touchAction = '';

    this.map.dragging.enable();

    container.removeEventListener('pointerdown', this.onPointerDown);
    container.removeEventListener('pointermove', this.onPointerMove);
    container.removeEventListener('pointerup', this.onPointerUp);
    container.removeEventListener('pointercancel', this.onPointerCancel);

    this.removeBox();
    this.isDrawing = false;
    this.startPoint = null;
  }

  /**
   * Pointer position relative to the map container
   */
  private containerPoint(e: PointerEvent): L.Point {
    return this.map.mouseEventToContainerPoint(e);
  }

  private removeBox(): void {
    if (this.currentBox) {
      this.currentBox.remove();
      this.currentBox = null;
    }
  }

  /**
   * Pointer down - start drawing
   */
  private onPointerDown = (e: PointerEvent): void => {
    // Only the primary button or a single touch starts a box
    if (!e.isPrimary || e.button !== 0) return;
    // Do not start a box on the map's own controls
    if ((e.target as HTMLElement | null)?.closest?.('.leaflet-control')) return;

    e.preventDefault();
    e.stopPropagation();

    this.isDrawing = true;
    this.startPoint = this.containerPoint(e);
    (e.target as Element | null)?.setPointerCapture?.(e.pointerId);

    // Create selection box element
    this.removeBox();
    this.currentBox = document.createElement('div');
    this.currentBox.className = 'selection-box';
    this.currentBox.style.cssText = `
      position: absolute;
      background: rgba(33, 150, 243, 0.1);
      border: 2px solid #2196F3;
      pointer-events: none;
      z-index: 1000;
    `;
    this.map.getContainer().appendChild(this.currentBox);
  };

  /**
   * Pointer move - update selection box
   */
  private onPointerMove = (e: PointerEvent): void => {
    if (!this.isDrawing || !this.startPoint || !this.currentBox) return;
    e.preventDefault();

    const current = this.containerPoint(e);
    const minX = Math.min(this.startPoint.x, current.x);
    const maxX = Math.max(this.startPoint.x, current.x);
    const minY = Math.min(this.startPoint.y, current.y);
    const maxY = Math.max(this.startPoint.y, current.y);

    this.currentBox.style.left = `${minX}px`;
    this.currentBox.style.top = `${minY}px`;
    this.currentBox.style.width = `${maxX - minX}px`;
    this.currentBox.style.height = `${maxY - minY}px`;
  };

  private onPointerCancel = (): void => {
    this.isDrawing = false;
    this.startPoint = null;
    this.removeBox();
  };

  /**
   * Pointer up - finish selection
   */
  private onPointerUp = (e: PointerEvent): void => {
    if (!this.isDrawing || !this.startPoint) return;

    this.isDrawing = false;
    this.removeBox();

    const start = this.startPoint;
    this.startPoint = null;
    const end = this.containerPoint(e);

    // Require minimum drag distance to prevent accidental selections
    if (start.distanceTo(end) < 10) {
      return;
    }

    // Convert screen coordinates to geographic bounds
    const sw = this.map.containerPointToLatLng(L.point(Math.min(start.x, end.x), Math.max(start.y, end.y)));
    const ne = this.map.containerPointToLatLng(L.point(Math.max(start.x, end.x), Math.min(start.y, end.y)));

    const bounds: BoundingBox = {
      north: ne.lat,
      south: sw.lat,
      east: ne.lng,
      west: sw.lng,
    };

    this.store.selectArea(bounds);
  };

  /**
   * Update map visualization based on selection state
   */
  private updateVisualization(state: SelectionState): void {
    this.areaLayer.clearLayers();
    if (state.selectedArea) {
      this.areaLayer.addData(createSelectionOverlay(state.selectedArea));
    }

    this.tilesLayer.clearLayers();
    if (state.requiredTiles.length > 0) {
      this.tilesLayer.addData(createTileOverlay(state.requiredTiles, state.cachedTiles));
    }
  }

  /**
   * Clear the current selection
   */
  public clearSelection(): void {
    this.store.clearSelection();
  }

  /**
   * Fit map view to current selection
   */
  public fitToSelection(): void {
    const state = this.store.getState();
    if (!state.selectedArea) return;

    const bounds = state.selectedArea;
    this.map.fitBounds(
      [[bounds.south, bounds.west], [bounds.north, bounds.east]],
      { padding: [50, 50], animate: true, duration: 0.5 }
    );
  }
}
