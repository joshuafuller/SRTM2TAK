/**
 * Area-Based Selection UI
 * 
 * Integrates the selection system with MapLibre GL
 */

import maplibregl from 'maplibre-gl';
import { SelectionStore, SelectionState, BoundingBox, createSelectionOverlay, createTileOverlay } from './selection-system';

export interface SelectionUIOptions {
  map: maplibregl.Map;
  selectionStore: SelectionStore;
  onSelectionChange?: (state: SelectionState) => void;
}

export class SelectionUI {
  private map: maplibregl.Map;
  private store: SelectionStore;
  private isDrawing = false;
  private startPoint: maplibregl.Point | null = null;
  private currentBox: HTMLDivElement | null = null;
  
  constructor(options: SelectionUIOptions) {
    this.map = options.map;
    this.store = options.selectionStore;
    
    // Subscribe to store changes
    if (options.onSelectionChange) {
      this.store.subscribe(options.onSelectionChange);
    }
    
    this.setupMapSources();
    this.setupMapLayers();
    this.bindEvents();
  }
  
  /**
   * Setup map sources for selection visualization
   */
  private setupMapSources(): void {
    // Source for selection area
    this.map.addSource('selection-area', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: []
      }
    });
    
    // Source for tile overlay
    this.map.addSource('selection-tiles', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: []
      }
    });
  }
  
  /**
   * Setup map layers for visualization
   */
  private setupMapLayers(): void {
    // Tile overlay layer (underneath selection)
    this.map.addLayer({
      id: 'selection-tiles-fill',
      type: 'fill',
      source: 'selection-tiles',
      paint: {
        'fill-color': [
          'case',
          ['get', 'cached'],
          '#4CAF50', // Green for cached
          '#2196F3'  // Blue for new
        ],
        'fill-opacity': 0.3
      }
    });
    
    this.map.addLayer({
      id: 'selection-tiles-outline',
      type: 'line',
      source: 'selection-tiles',
      paint: {
        'line-color': [
          'case',
          ['get', 'cached'],
          '#4CAF50',
          '#2196F3'
        ],
        'line-width': 2,
        'line-opacity': 0.8
      }
    });
    
    // Selection area layer (on top)
    this.map.addLayer({
      id: 'selection-area-fill',
      type: 'fill',
      source: 'selection-area',
      paint: {
        'fill-color': '#FF9800',
        'fill-opacity': 0.1
      }
    });
    
    this.map.addLayer({
      id: 'selection-area-outline',
      type: 'line',
      source: 'selection-area',
      paint: {
        'line-color': '#FF9800',
        'line-width': 3,
        'line-dasharray': [2, 2]
      }
    });
  }
  
  /**
   * Bind map events for area selection
   */
  private bindEvents(): void {
    // Store changes update visualization
    this.store.subscribe(state => {
      this.updateVisualization(state);
    });
  }
  
  /**
   * Enable area selection mode
   */
  public startAreaSelection(): void {
    // Change cursor
    this.map.getCanvas().style.cursor = 'crosshair';

    // Disable map interactions
    this.map.dragPan.disable();

    // Prevent pull-to-refresh and other touch gestures
    const canvas = this.map.getCanvas();
    canvas.style.touchAction = 'none';

    // Bind selection events (mouse and touch)
    this.map.on('mousedown', this.onMouseDown);
    this.map.on('mousemove', this.onMouseMove);
    this.map.on('mouseup', this.onMouseUp);

    // Add touch support
    this.map.on('touchstart', this.onMouseDown);
    this.map.on('touchmove', this.onMouseMove);
    this.map.on('touchend', this.onMouseUp);
  }
  
  /**
   * Disable area selection mode
   */
  public stopAreaSelection(): void {
    // Reset cursor
    this.map.getCanvas().style.cursor = '';

    // Re-enable touch gestures
    const canvas = this.map.getCanvas();
    canvas.style.touchAction = '';

    // Re-enable map interactions
    this.map.dragPan.enable();

    // Unbind selection events (mouse and touch)
    this.map.off('mousedown', this.onMouseDown);
    this.map.off('mousemove', this.onMouseMove);
    this.map.off('mouseup', this.onMouseUp);

    this.map.off('touchstart', this.onMouseDown);
    this.map.off('touchmove', this.onMouseMove);
    this.map.off('touchend', this.onMouseUp);
    
    // Clean up any selection box
    if (this.currentBox) {
      this.currentBox.remove();
      this.currentBox = null;
    }
  }
  
  /**
   * Handle mouse down - start drawing
   */
  private onMouseDown = (e: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent): void => {

    // Prevent propagation and default browser behavior (pull-to-refresh, etc)
    e.preventDefault();
    if (e.originalEvent) {
      e.originalEvent.preventDefault();
      e.originalEvent.stopPropagation();
    }

    this.isDrawing = true;
    this.startPoint = e.point;
    
    // Create selection box element
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
  }
  
  /**
   * Handle mouse move - update selection box
   */
  private onMouseMove = (e: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent): void => {
    if (!this.isDrawing || !this.startPoint || !this.currentBox) return;

    // Prevent default touch behavior
    if (e.originalEvent) {
      e.originalEvent.preventDefault();
    }
    
    const current = e.point;
    const minX = Math.min(this.startPoint.x, current.x);
    const maxX = Math.max(this.startPoint.x, current.x);
    const minY = Math.min(this.startPoint.y, current.y);
    const maxY = Math.max(this.startPoint.y, current.y);
    
    // Update box position and size
    this.currentBox.style.left = `${minX}px`;
    this.currentBox.style.top = `${minY}px`;
    this.currentBox.style.width = `${maxX - minX}px`;
    this.currentBox.style.height = `${maxY - minY}px`;
  }
  
  /**
   * Handle mouse up - finish selection
   */
  private onMouseUp = (e: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent): void => {

    if (!this.isDrawing || !this.startPoint) return;

    this.isDrawing = false;

    // Clean up selection box
    if (this.currentBox) {
      this.currentBox.remove();
      this.currentBox = null;
    }

    const endPoint = e.point;

    // Require minimum drag distance to prevent accidental selections
    const minDragDistance = 10; // pixels
    const dragDistance = Math.sqrt(
      Math.pow(endPoint.x - this.startPoint.x, 2) +
      Math.pow(endPoint.y - this.startPoint.y, 2)
    );

    if (dragDistance < minDragDistance) {
      return;
    }
    
    // Check if it's a meaningful selection (not just a click)
    const dx = Math.abs(endPoint.x - this.startPoint.x);
    const dy = Math.abs(endPoint.y - this.startPoint.y);
    
    if (dx < 5 && dy < 5) {
      // Too small, ignore
      this.startPoint = null;
      return;
    }
    
    // Convert screen coordinates to geographic bounds
    const sw = this.map.unproject([
      Math.min(this.startPoint.x, endPoint.x),
      Math.max(this.startPoint.y, endPoint.y)
    ]);
    
    const ne = this.map.unproject([
      Math.max(this.startPoint.x, endPoint.x),
      Math.min(this.startPoint.y, endPoint.y)
    ]);
    
    const bounds: BoundingBox = {
      north: ne.lat,
      south: sw.lat,
      east: ne.lng,
      west: sw.lng
    };
    
    // Update selection
    this.store.selectArea(bounds);
    
    // Reset
    this.startPoint = null;
    this.isDrawing = false;
  }
  
  /**
   * Update map visualization based on selection state
   */
  private updateVisualization(state: SelectionState): void {
    // Update selection area
    if (state.selectedArea) {
      const areaFeature = createSelectionOverlay(state.selectedArea);
      (this.map.getSource('selection-area') as maplibregl.GeoJSONSource)
        .setData({
          type: 'FeatureCollection',
          features: [areaFeature]
        });
    } else {
      (this.map.getSource('selection-area') as maplibregl.GeoJSONSource)
        .setData({
          type: 'FeatureCollection',
          features: []
        });
    }
    
    // Update tile overlay
    if (state.requiredTiles.length > 0) {
      const tileFeatures = createTileOverlay(state.requiredTiles, state.cachedTiles);
      (this.map.getSource('selection-tiles') as maplibregl.GeoJSONSource)
        .setData(tileFeatures);
    } else {
      (this.map.getSource('selection-tiles') as maplibregl.GeoJSONSource)
        .setData({
          type: 'FeatureCollection',
          features: []
        });
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
      [[bounds.west, bounds.south], [bounds.east, bounds.north]],
      { padding: 50, duration: 500 }
    );
  }
}