/**
 * SRTM2TAK Main Application Entry Point
 */

import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles/main.css';
import { DownloadManager } from './lib/download-manager';
import { StorageManager } from './lib/storage-manager';
import { notifications } from './lib/notification-manager';
import { estimateFileSizes, formatBytes, latLonToTileId } from './lib/tile-utils';
import { buildCachedGeoJSON } from './lib/cached-overlay';
import { computeServiceWorkerUrl } from './lib/sw';
import { SelectionStore } from './lib/selection-system';
import { SelectionUI } from './lib/selection-ui';

// Application state
interface AppState {
  map: maplibregl.Map | null;
  selectedTiles: Set<string>;
  downloadingTiles: Set<string>;
  downloadedTiles: Set<string>; // tiles that completed successfully (including cache hits)
  failedTiles: Set<string>;     // tiles that failed or were ocean/missing
  cachedTiles: Set<string>;     // tiles present in cache
  selectionBounds: { north: number; south: number; east: number; west: number } | null;
  isDrawing: boolean;
  drawStartPoint: maplibregl.LngLat | null;
  tileGridSourceAdded: boolean;
  downloadManager: DownloadManager | null;
  isDownloading: boolean;
  downloadCancelled: boolean;  // Track if download was cancelled
  downloadFilename: string | null; // Store filename for current download
  selectionStore: SelectionStore;
  selectionUI: SelectionUI | null;
  settings: {
    showGrid: boolean;
    showLabels: boolean;
    concurrentDownloads: number;
    useCache: boolean;
  };
}

const state: AppState = {
  map: null,
  selectedTiles: new Set(),
  downloadingTiles: new Set(),
  downloadedTiles: new Set(),
  failedTiles: new Set(),
  cachedTiles: new Set(),
  selectionBounds: null,
  isDrawing: false,
  drawStartPoint: null,
  tileGridSourceAdded: false,
  downloadManager: null,
  isDownloading: false,
  downloadCancelled: false,
  downloadFilename: null,
  selectionStore: new SelectionStore(),
  selectionUI: null,
  settings: {
    showGrid: true,
    showLabels: true,
    concurrentDownloads: 3,
    useCache: true,
  },
};

// Expose state to window for debugging
if (typeof window !== 'undefined') {
  (window as any).appState = state;
}

/**
 * Show zoom message when zoom is too low for tile selection
 */
function showZoomMessage(): void {
  const existingAlert = document.querySelector('.zoom-alert');
  if (existingAlert) return; // Already showing
  
  const alert = document.createElement('div');
  alert.className = 'zoom-alert';
  alert.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="11" cy="11" r="8"></circle>
      <path d="m21 21-4.35-4.35"></path>
      <path d="M11 8v6M8 11h6"></path>
    </svg>
    <span>Zoom in to select tiles (zoom level 5+)</span>
    <button onclick="this.parentElement.remove()">×</button>
  `;
  document.body.appendChild(alert);
}

/**
 * Hide zoom message
 */
function hideZoomMessage(): void {
  const alert = document.querySelector('.zoom-alert');
  if (alert) alert.remove();
}

/**
 * Handle tile selection with proper feedback
 */
function handleTileSelection(tileId: string): void {
  console.trace('handleTileSelection called for:', tileId);
  // Toggle tile selection - simplified for compatibility
  if (state.selectedTiles.has(tileId)) {
    state.selectedTiles.delete(tileId);
  } else {
    state.selectedTiles.add(tileId);
  }

  // Provide haptic feedback on mobile
  if (navigator.vibrate) navigator.vibrate(10);
  
  // Visual feedback animation
  if (state.map) {
    // Flash the tile briefly
    const originalOpacity = state.map.getPaintProperty('tile-grid-fill', 'fill-opacity');
    state.map.setPaintProperty('tile-grid-fill', 'fill-opacity', 0.8);
    setTimeout(() => {
      if (state.map) {
        state.map.setPaintProperty('tile-grid-fill', 'fill-opacity', originalOpacity);
      }
    }, 150);
  }
  
  // Update UI
  drawTileGrid();
  renderSelectedTiles();
  updateSelectionInfo();
  renderAreasPanel();
  
  // Show toast notification
  showToast(`Updated tile selection ${tileId}`);
}

/**
 * Show toast notification (UX best practice)
 */
function showToast(message: string, duration: number = 2000): void {
  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.textContent = message;
  document.body.appendChild(toast);
  
  // Animate in
  setTimeout(() => toast.classList.add('show'), 10);
  
  // Remove after duration
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Initialize the MapLibre GL map with vector tiles
 */
function initializeMap(): void {
  // Get map container
  const mapElement = document.getElementById('map');
  if (!mapElement) {
    console.error('Map container not found');
    return;
  }

  // Create map with OpenStreetMap raster tiles (simpler, no vector tiles)
  state.map = new maplibregl.Map({
    container: mapElement,
    style: {
      version: 8,
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
      sources: {
        'osm-raster': {
          type: 'raster',
          tiles: [
            'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
            'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
            'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
          ],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors'
        }
      },
      layers: [
        {
          id: 'osm-raster-layer',
          type: 'raster',
          source: 'osm-raster',
          minzoom: 0,
          maxzoom: 19
        }
      ]
    },
    center: [-98.5795, 39.8283], // Center of USA [lng, lat]
    zoom: 4,
    minZoom: 2,
    maxZoom: 10,
  });

  // Wait for map to load
  state.map.on('load', () => {
    // Add SRTM coverage layer
    addSRTMCoverage();
    
    // Initialize tile grid
    if (state.settings.showGrid) {
      drawTileGrid();
    }

    // Initialize selection UI
    if (state.map) {
      state.selectionUI = new SelectionUI({
        map: state.map,
      selectionStore: state.selectionStore,
      onSelectionChange: (selectionState) => {
        // Update UI based on selection state
        updateSelectionInfo(selectionState);
      }
    });
    }

    // Load all cached tiles so they render as cached on the map
    void loadAllCachedTiles();
    // Initial render of cached tiles overlay
    renderCachedTiles();

    // Set up map event handlers
    setupMapEvents();
  });
}

/**
 * Add SRTM coverage overlay
 */
function addSRTMCoverage(): void {
  if (!state.map) return;

  // Add SRTM coverage area (60°N to 56°S)
  state.map.addSource('srtm-coverage', {
    type: 'geojson',
    data: {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-180, -56],
          [180, -56],
          [180, 60],
          [-180, 60],
          [-180, -56],
        ]],
      },
    },
  });

  state.map.addLayer({
    id: 'srtm-coverage-fill',
    type: 'fill',
    source: 'srtm-coverage',
    paint: {
      'fill-color': '#2196F3',
      'fill-opacity': 0.05,
    },
  });

  state.map.addLayer({
    id: 'srtm-coverage-outline',
    type: 'line',
    source: 'srtm-coverage',
    paint: {
      'line-color': '#2196F3',
      'line-width': 2,
      'line-opacity': 0.3,
    },
  });
}

/**
 * Generate tile grid GeoJSON
 */
function generateTileGridGeoJSON(): any {
  if (!state.map) return null;

  const bounds = state.map.getBounds();
  const zoom = state.map.getZoom();

  // Only show grid at higher zoom levels (best practice: provide user feedback)
  if (zoom < 5) {
    // Show helpful message to user
    showZoomMessage();
    return {
      type: 'FeatureCollection',
      features: [],
    };
  } else {
    hideZoomMessage();
  }

  const features = [];
  
  // Calculate visible tiles
  const south = Math.floor(Math.max(bounds.getSouth(), -56));
  const north = Math.ceil(Math.min(bounds.getNorth(), 60));
  const west = Math.floor(bounds.getWest());
  const east = Math.ceil(bounds.getEast());

  // Generate features for each tile
  for (let lat = south; lat < north; lat++) {
    for (let lon = west; lon < east; lon++) {
      const tileId = latLonToTileId(lat, lon);
      const isSelected = state.selectedTiles.has(tileId);
      // Determine status for selected tiles
      // pending: selected but not yet completed; success: downloaded/cached; failed: error/ocean
      let status = 'idle';
      // Global cached status is shown regardless of selection
      if (state.cachedTiles.has(tileId)) {
        status = 'cached';
      }
      // Selection-specific states override pending/downloading/success/failed
      if (isSelected) {
        if (state.downloadedTiles.has(tileId)) status = 'success';
        else if (state.failedTiles.has(tileId)) status = 'failed';
        else if (state.downloadingTiles.has(tileId)) status = 'downloading';
        else if (status !== 'cached') status = 'pending';
      }

      features.push({
        type: 'Feature',
        properties: {
          tileId,
          selected: isSelected,
          status,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [lon, lat],
            [lon + 1, lat],
            [lon + 1, lat + 1],
            [lon, lat + 1],
            [lon, lat],
          ]],
        },
      });

      // Add label point if needed
      if (state.settings.showLabels && zoom >= 7) {
        features.push({
          type: 'Feature',
          properties: {
            tileId,
            label: tileId,
          },
          geometry: {
            type: 'Point',
            coordinates: [lon + 0.5, lat + 0.5],
          },
        });
      }
    }
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

/**
 * Draw SRTM tile grid on the map
 */
function drawTileGrid(): void {
  if (!state.map) return;

  const gridData = generateTileGridGeoJSON();

  if (!state.tileGridSourceAdded) {
    // Add source and layers for the first time
    state.map.addSource('tile-grid', {
      type: 'geojson',
      data: gridData,
    });

    // Add tile outline layer
    state.map.addLayer({
      id: 'tile-grid-lines',
      type: 'line',
      source: 'tile-grid',
      paint: {
        'line-color': [
          'match',
          ['get', 'status'],
          'downloading', '#f1c40f',  // Yellow border for downloading
          'success', '#2ecc71',       // Green border for completed
          'cached', '#2ecc71',        // Green border for cached
          'failed', '#e74c3c',        // Red border for failed
          'pending', '#2196F3',       // Blue border for pending
          '#666'                      // Gray for idle/unselected
        ],
        'line-width': [
          'case',
          ['==', ['get', 'status'], 'downloading'],
          3,  // Thicker border for downloading tiles
          ['get', 'selected'],
          2,
          1,
        ],
        'line-opacity': [
          'case',
          ['==', ['get', 'status'], 'downloading'],
          1,  // Full opacity for downloading
          ['==', ['get', 'status'], 'success'],
          0.9,  // High opacity for completed
          ['==', ['get', 'status'], 'cached'],
          0.9,  // High opacity for cached
          ['get', 'selected'],
          0.8,
          0.3,
        ],
      },
    });

    // Add tile fill layer
    state.map.addLayer({
      id: 'tile-grid-fill',
      type: 'fill',
      source: 'tile-grid',
      // No filter: we use opacity to hide idle tiles
      paint: {
        // Color by download status: success=green, failed=red, pending=blue
        'fill-color': [
          'match',
          ['get', 'status'],
          'cached',  '#2ecc71',
          'success', '#2ecc71',
          'failed',  '#e74c3c',
          'downloading', '#f1c40f',
          /* pending/default */ '#2196F3'
        ],
        'fill-opacity': [
          'case',
          ['==', ['get', 'status'], 'idle'],
          0,
          ['==', ['get', 'status'], 'downloading'],
          0.6,  // Make downloading tiles more visible
          ['==', ['get', 'status'], 'success'],
          0.5,   // Make completed tiles clearly visible
          ['==', ['get', 'status'], 'cached'],
          0.5,   // Make cached tiles clearly visible
          0.35   // Default for pending/failed
        ],
      },
    });

    // Add label layer
    state.map.addLayer({
      id: 'tile-labels',
      type: 'symbol',
      source: 'tile-grid',
      filter: ['has', 'label'],
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 11,
        'text-anchor': 'center',
      },
      paint: {
        'text-color': '#333',
        'text-halo-color': '#fff',
        'text-halo-width': 1,
      },
    });

    state.tileGridSourceAdded = true;
  } else {
    // Update existing source
    const source = state.map.getSource('tile-grid') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(gridData);
    }
  }

  // Toggle label visibility
  if (state.map.getLayer('tile-labels')) {
    state.map.setLayoutProperty(
      'tile-labels',
      'visibility',
      state.settings.showLabels ? 'visible' : 'none'
    );
  }
}

/**
 * Format tile ID from coordinates
 */
// Use shared tile utils for tile ID formatting

/**
 * Set up map event handlers
 */
function setupMapEvents(): void {
  if (!state.map) return;

  // Redraw grid on zoom/move
  state.map.on('zoomend', () => {
    if (state.settings.showGrid) {
      drawTileGrid();
    }
    renderCachedTiles();
    renderSelectedTiles();
  });

  state.map.on('moveend', () => {
    if (state.settings.showGrid) {
      drawTileGrid();
    }
     renderCachedTiles();
     renderSelectedTiles();
  });

  // Drawing events are now handled by SelectionUI
  // No need to register separate mouse/touch handlers

  // NO INDIVIDUAL TILE CLICK HANDLERS
  // Selection is ONLY through the draw selection box
  // This prevents accidental selections

  /*
  // Handle tile clicks (mouse and touch)
  let layerTileClickHandled = false;
  let lastClickTime = 0;
  let mouseDownTarget: string | null = null;
  let mouseDownTime = 0;

  // Track mousedown to ensure click is intentional
  state.map.on('mousedown', 'tile-grid-lines', (e) => {
    if (e.features && e.features[0]) {
      mouseDownTarget = e.features[0].properties?.tileId || null;
      mouseDownTime = Date.now();
    }
  });

  state.map.on('mousedown', 'tile-grid-fill', (e) => {
    if (e.features && e.features[0]) {
      mouseDownTarget = e.features[0].properties?.tileId || null;
      mouseDownTime = Date.now();
    }
  });

  state.map.on('click', 'tile-grid-lines', (e) => {
    if (!state.isDrawing && e.features && e.features[0]) {
      e.originalEvent?.stopPropagation();
      const tileId = e.features[0].properties?.tileId;
      if (tileId) {
        layerTileClickHandled = true;
        handleTileSelection(tileId);
        if (navigator.vibrate) navigator.vibrate(10);
        drawTileGrid();
        renderSelectedTiles();
        updateSelectionInfo();
        renderAreasPanel();
      }
    }
  });

  /* DISABLED - Selection is ONLY through draw box
  // Also allow clicking filled polygons
  state.map.on('click', 'tile-grid-fill', (e) => {
    console.log('tile-grid-fill click event:', {
      isTrusted: e.originalEvent?.isTrusted,
      type: e.originalEvent?.type,
      buttons: e.originalEvent?.buttons,
      detail: e.originalEvent?.detail,
      target: e.originalEvent?.target,
      isDrawing: state.isDrawing,
      mouseDownTarget,
      timeSinceMouseDown: Date.now() - mouseDownTime
    });

    // Only accept real mouse clicks (detail > 0 means actual click, not programmatic)
    if (!e.originalEvent || e.originalEvent.detail === 0) {
      console.log('Rejecting programmatic/synthetic click on fill (detail=0)');
      mouseDownTarget = null;
      return;
    }

    // Ensure this is a real user click with mousedown first
    if (!mouseDownTarget || Date.now() - mouseDownTime > 1000) {
      console.log('Rejecting click without recent mousedown on fill');
      mouseDownTarget = null;
      return;
    }

    // Ensure this is a real user click, not a synthetic event
    if (!e.originalEvent.isTrusted) {
      console.log('Rejecting untrusted click event on fill');
      mouseDownTarget = null;
      return;
    }

    // Prevent rapid-fire events (debounce)
    const now = Date.now();
    if (now - lastClickTime < 100) {
      console.log('Rejecting rapid-fire click on fill');
      return;
    }
    lastClickTime = now;

    if (!state.isDrawing && e.features && e.features[0]) {
      e.originalEvent?.stopPropagation();
      const tileId = e.features[0].properties?.tileId;
      if (tileId) {
        console.log('Selecting tile from fill:', tileId);
        layerTileClickHandled = true;
        handleTileSelection(tileId);
        if (navigator.vibrate) navigator.vibrate(10);
        drawTileGrid();
        renderSelectedTiles();
        updateSelectionInfo();
        renderAreasPanel();
        mouseDownTarget = null; // Reset after handling
      }
    }
    mouseDownTarget = null; // Reset even if not handled
  });

  // Also handle touches on tiles
  state.map.on('touchend', 'tile-grid-lines', (e) => {
    // Ensure this is a real touch event
    if (!e.originalEvent || !e.originalEvent.isTrusted) return;

    if (!state.isDrawing && e.features && e.features[0]) {
      e.preventDefault(); // Prevent triggering click as well
      const tileId = e.features[0].properties?.tileId;
      if (tileId) {
        layerTileClickHandled = true;
        handleTileSelection(tileId);
        if (navigator.vibrate) navigator.vibrate(10);
        drawTileGrid();
        renderSelectedTiles();
        updateSelectionInfo();
        renderAreasPanel();
      }
    }
  });
  */

  // Remove any stale fallback; selection is only via draw box now

  /* DISABLED - No hover cursor since tiles aren't clickable
  // Change cursor on hover (UX best practice: visual feedback)
  state.map.on('mouseenter', 'tile-grid-fill', (e) => {
    if (state.map) {
      state.map.getCanvas().style.cursor = 'pointer';
      // Add hover highlight
      if (e.features && e.features[0]) {
        state.map.setPaintProperty('tile-grid-fill', 'fill-opacity', [
          'case',
          ['==', ['get', 'tileId'], e.features[0].properties?.tileId],
          0.5,
          ['get', 'selected'], 0.4,
          0.1
        ]);
      }
    }
  });

  state.map.on('mouseleave', 'tile-grid-fill', () => {
    if (state.map) {
      state.map.getCanvas().style.cursor = '';
      // Reset opacity
      state.map.setPaintProperty('tile-grid-fill', 'fill-opacity', [
        'case',
        ['get', 'selected'], 0.4,
        0.1
      ]);
    }
  });
  
  // Also add hover for tile lines
  state.map.on('mouseenter', 'tile-grid-lines', () => {
    if (state.map) {
      state.map.getCanvas().style.cursor = 'pointer';
    }
  });
  
  state.map.on('mouseleave', 'tile-grid-lines', () => {
    if (state.map) {
      state.map.getCanvas().style.cursor = '';
    }
  });
  */
}

/**
 * Handle mouse down for rectangle drawing
 */
function handleMouseDown(e: maplibregl.MapMouseEvent): void {
  if (!state.isDrawing || !state.map) return;

  // Prevent default drag behavior
  e.preventDefault();

  // Store start point
  state.drawStartPoint = e.lngLat;

  // Add selection box source if it doesn't exist
  if (!state.map.getSource('selection-box')) {
    state.map.addSource('selection-box', {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [[]],
        },
      },
    });

    state.map.addLayer({
      id: 'selection-box-fill',
      type: 'fill',
      source: 'selection-box',
      paint: {
        'fill-color': '#2196F3',
        'fill-opacity': 0.2,
      },
    });

    state.map.addLayer({
      id: 'selection-box-outline',
      type: 'line',
      source: 'selection-box',
      paint: {
        'line-color': '#2196F3',
        'line-width': 2,
        'line-dasharray': [5, 5],
      },
    });
  }
}

/**
 * Handle mouse move for rectangle drawing
 */
function handleMouseMove(e: maplibregl.MapMouseEvent): void {
  if (!state.isDrawing || !state.drawStartPoint || !state.map) return;

  // Update selection box
  const source = state.map.getSource('selection-box') as maplibregl.GeoJSONSource;
  if (source) {
    const start = state.drawStartPoint;
    const current = e.lngLat;

    source.setData({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [start.lng, start.lat],
          [current.lng, start.lat],
          [current.lng, current.lat],
          [start.lng, current.lat],
          [start.lng, start.lat],
        ]],
      },
    });
  }
}

/**
 * Handle mouse up for rectangle drawing
 */
function handleMouseUp(e: maplibregl.MapMouseEvent): void {
  if (!state.isDrawing || !state.drawStartPoint || !state.map) return;

  // Calculate bounds
  const start = state.drawStartPoint;
  const end = e.lngLat;

  state.selectionBounds = {
    south: Math.min(start.lat, end.lat),
    north: Math.max(start.lat, end.lat),
    west: Math.min(start.lng, end.lng),
    east: Math.max(start.lng, end.lng),
  };

  // Calculate selected tiles
  updateSelectedTiles();

  // Clear drawing state
  state.drawStartPoint = null;
  state.isDrawing = false;

  // Update UI
  const drawButton = document.getElementById('draw-rectangle');
  if (drawButton) {
    drawButton.classList.remove('active');
  }

  updateSelectionInfo();
  drawTileGrid();
}

/**
 * Handle touch start for rectangle drawing
 */
function handleTouchStart(e: maplibregl.MapTouchEvent): void {
  if (!state.isDrawing || !state.map) return;
  
  // Prevent default to avoid conflicts
  e.preventDefault();
  
  // Get first touch point
  if (e.points && e.points.length > 0) {
    const point = e.points[0];
    state.drawStartPoint = e.lngLat;
    
    // Add selection box source if it doesn't exist
    if (!state.map.getSource('selection-box')) {
      state.map.addSource('selection-box', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [[]],
          },
        },
      });

      state.map.addLayer({
        id: 'selection-box-fill',
        type: 'fill',
        source: 'selection-box',
        paint: {
          'fill-color': '#2196F3',
          'fill-opacity': 0.2,
        },
      });

      state.map.addLayer({
        id: 'selection-box-outline',
        type: 'line',
        source: 'selection-box',
        paint: {
          'line-color': '#2196F3',
          'line-width': 2,
          'line-dasharray': [5, 5],
        },
      });
    }
  }
}

/**
 * Handle touch move for rectangle drawing
 */
function handleTouchMove(e: maplibregl.MapTouchEvent): void {
  if (!state.isDrawing || !state.drawStartPoint || !state.map) return;
  
  // Prevent default to avoid scrolling
  e.preventDefault();
  
  // Update selection box
  const source = state.map.getSource('selection-box') as maplibregl.GeoJSONSource;
  if (source && e.lngLat) {
    const start = state.drawStartPoint;
    const current = e.lngLat;

    source.setData({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [start.lng, start.lat],
          [current.lng, start.lat],
          [current.lng, current.lat],
          [start.lng, current.lat],
          [start.lng, start.lat],
        ]],
      },
    });
  }
}

/**
 * Handle touch end for rectangle drawing
 */
function handleTouchEnd(e: maplibregl.MapTouchEvent): void {
  if (!state.isDrawing || !state.drawStartPoint || !state.map) return;

  // Calculate bounds
  const start = state.drawStartPoint;
  const end = e.lngLat;

  state.selectionBounds = {
    south: Math.min(start.lat, end.lat),
    north: Math.max(start.lat, end.lat),
    west: Math.min(start.lng, end.lng),
    east: Math.max(start.lng, end.lng),
  };

  // Calculate selected tiles
  updateSelectedTiles();

  // Clear drawing state
  state.drawStartPoint = null;
  state.isDrawing = false;

  // Update UI
  const drawButton = document.getElementById('draw-rectangle');
  if (drawButton) {
    drawButton.classList.remove('active');
  }

  updateSelectionInfo();
  drawTileGrid();
}

/**
 * Update selected tiles based on selection bounds
 */
function updateSelectedTiles(): void {
  if (!state.selectionBounds) return;
  const south = Math.floor(Math.max(state.selectionBounds.south, -56));
  const north = Math.ceil(Math.min(state.selectionBounds.north, 60));
  const west = Math.floor(state.selectionBounds.west);
  const east = Math.ceil(state.selectionBounds.east);
  const tiles: string[] = [];
  for (let lat = south; lat < north; lat++) {
    for (let lon = west; lon < east; lon++) {
      tiles.push(latLonToTileId(lat, lon));
    }
  }
  // Legacy: just add tiles to selection
  for (const tile of tiles) {
    state.selectedTiles.add(tile);
  }
  // renderAreasPanel(); // Removed - using new selection system
}

/** Render Areas list in info panel */
function renderAreasPanel(): void {
  const container = document.getElementById('areas-list');
  if (!container) return;
  container.innerHTML = '';
  // Legacy function - no longer used with new selection system
  return; // Legacy function disabled
}

/**
 * Update selection info panel with new selection state
 */
function updateSelectionInfo(selectionState?: any): void {
  // If using new selection system
  if (selectionState) {
    // Update tile count with friendly names
    const tileCountElement = document.getElementById('tile-count');
    if (tileCountElement) {
      const total = selectionState.totalTiles;
      const cached = selectionState.cachedTiles.size;
      const extra = cached > 0 ? ` (${cached} cached)` : '';
      tileCountElement.textContent = `${total} tile${total !== 1 ? 's' : ''}${extra}`;
    }

    // Update download size
    const downloadSizeElement = document.getElementById('download-size');
    if (downloadSizeElement) {
      const sizeInMB = (selectionState.downloadSize / (1024 * 1024)).toFixed(1);
      downloadSizeElement.textContent = `${sizeInMB} MB`;
    }

    // Update coverage area with friendly description
    const coverageElement = document.getElementById('coverage-area');
    if (coverageElement) {
      if (selectionState.totalTiles === 0) {
        coverageElement.textContent = '0°×0°';
      } else if (selectionState.friendlyDescription) {
        coverageElement.textContent = selectionState.friendlyDescription;
      } else if (selectionState.selectedArea) {
        const bounds = selectionState.selectedArea;
        const height = Math.abs(bounds.north - bounds.south);
        const width = Math.abs(bounds.east - bounds.west);
        coverageElement.textContent = `${height.toFixed(1)}°×${width.toFixed(1)}°`;
      }
    }

    // Update areas list with friendly names
    const areasSection = document.getElementById('areas-section');
    const areasList = document.getElementById('areas-list');
    if (selectionState.totalTiles === 0) {
      // No selection - hide areas section
      if (areasSection) areasSection.style.display = 'none';
      if (areasList) areasList.innerHTML = '';
    } else if (areasList && selectionState.tilesWithNames && selectionState.tilesWithNames.length > 0) {
      areasList.innerHTML = '';
      const uniqueAreas = new Map<string, number>();
      
      for (const tile of selectionState.tilesWithNames) {
        const key = tile.friendlyName;
        uniqueAreas.set(key, (uniqueAreas.get(key) || 0) + 1);
      }
      
      for (const [area, count] of uniqueAreas) {
        const span = document.createElement('span');
        span.className = 'area-item';
        span.textContent = count > 1 ? `${area} (${count} tiles)` : area;
        areasList.appendChild(span);
      }
      
      if (areasSection) areasSection.style.display = 'block';
    } else if (areasSection) {
      areasSection.style.display = 'none';
    }

    // Enable/disable download button
    const downloadButton = document.getElementById('download-button') as HTMLButtonElement;
    if (downloadButton) {
      downloadButton.disabled = selectionState.totalTiles === 0 || selectionState.newTiles.size === 0;
    }

    // Show info panel if tiles selected
    const infoPanel = document.getElementById('info-panel');
    if (infoPanel && selectionState.totalTiles > 0) {
      infoPanel.classList.remove('hidden');
    }

    // Don't overwrite selectedTiles from SelectionStore - it should be the other way around
    // The selectedTiles state should drive the SelectionStore, not vice versa
    
    return;
  }
  
  // Original implementation for backward compatibility
  updateSelectionInfoLegacy();
}

/**
 * Legacy update selection info panel
 */
function updateSelectionInfoLegacy(): void {
  const tileCount = state.selectedTiles.size;
  let cachedCount = 0;
  if (state.cachedTiles.size > 0) {
    // Only count cached among selected
    for (const t of state.selectedTiles) if (state.cachedTiles.has(t)) cachedCount++;
  }
  
  // Update tile count
  const tileCountElement = document.getElementById('tile-count');
  if (tileCountElement) {
    const extra = cachedCount > 0 ? ` (${cachedCount} cached)` : '';
    tileCountElement.textContent = `${tileCount} tile${tileCount !== 1 ? 's' : ''}${extra}`;
  }

  // Update download size
  const downloadSizeElement = document.getElementById('download-size');
  if (downloadSizeElement) {
    const sizes = estimateFileSizes(tileCount);
    downloadSizeElement.textContent = sizes.compressedFormatted;
  }

  // Update coverage area
  const coverageElement = document.getElementById('coverage-area');
  if (coverageElement && state.selectionBounds) {
    const height = Math.abs(state.selectionBounds.north - state.selectionBounds.south);
    const width = Math.abs(state.selectionBounds.east - state.selectionBounds.west);
    coverageElement.textContent = `${height.toFixed(1)}°×${width.toFixed(1)}°`;
  }

  // Enable/disable download button
  const downloadButton = document.getElementById('download-button') as HTMLButtonElement;
  if (downloadButton) {
    downloadButton.disabled = tileCount === 0;
  }

  // Show info panel if tiles selected
  const infoPanel = document.getElementById('info-panel');
  if (infoPanel) {
    if (tileCount > 0) {
      infoPanel.classList.remove('hidden');
    }
  }

  // Refresh cached tile highlights (async)
  void refreshCachedTiles();
}

/**
 * Check cache for selected tiles and mark them
 */
async function refreshCachedTiles(): Promise<void> {
  if (!state.selectedTiles.size) return;
  try {
    const dm = new DownloadManager({ useCache: true });
    const set = await dm.getCachedTiles(Array.from(state.selectedTiles));
    state.cachedTiles = set;
    // Reflect cached tiles as downloaded-success in overlay too
    for (const id of set) {
      state.downloadedTiles.add(id);
      state.failedTiles.delete(id);
      state.downloadingTiles.delete(id);
    }
    if (state.settings.showGrid) drawTileGrid();
    renderCachedTiles();
    // Also update tile count to include cached
    const tileCountElement = document.getElementById('tile-count');
    if (tileCountElement) {
      const total = state.selectedTiles.size;
      const extra = set.size > 0 ? ` (${set.size} cached)` : '';
      tileCountElement.textContent = `${total} tile${total !== 1 ? 's' : ''}${extra}`;
    }
  } catch (e) {
    // Cache not accessible; ignore
  }
}

/**
 * Load all cached tiles from IndexedDB to render them immediately
 */
async function loadAllCachedTiles(): Promise<void> {
  try {
    const sm = new StorageManager();
    await sm.init();
    const tiles = await sm.getAllTiles();
    const ids = new Set<string>();
    for (const t of tiles) ids.add(t.id);
    state.cachedTiles = ids;
    if (state.settings.showGrid) drawTileGrid();
    renderCachedTiles();
  } catch {
    // If storage unavailable, ignore
  }
}

/**
 * Render cached tiles overlay for all zoom levels
 */
function renderCachedTiles(): void {
  if (!state.map) return;
  const map = state.map;
  const b = map.getBounds();
  const data = buildCachedGeoJSON(state.cachedTiles, {
    north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest()
  });
  const source = map.getSource('cached-tiles');
  if (!source) {
    map.addSource('cached-tiles', { type: 'geojson', data });
    // Fill under grid fill so selection colors can override
    map.addLayer({
      id: 'cached-tiles-fill',
      type: 'fill',
      source: 'cached-tiles',
      paint: {
        'fill-color': '#2ecc71',
        'fill-opacity': 0.2,
      },
    }, 'tile-grid-fill');
    // Optional outline for visibility
    map.addLayer({
      id: 'cached-tiles-outline',
      type: 'line',
      source: 'cached-tiles',
      paint: {
        'line-color': '#2ecc71',
        'line-width': 1,
        'line-opacity': 0.4,
      },
    }, 'tile-grid-fill');
  } else {
    (source as maplibregl.GeoJSONSource).setData(data);
  }
}

/** Render selected tiles overlay (all zooms) */
function renderSelectedTiles(): void {
  if (!state.map) return;
  const map = state.map;
  const b = map.getBounds();
  const data = buildCachedGeoJSON(state.selectedTiles, {
    north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest()
  });
  const source = map.getSource('selected-tiles');
  if (!source) {
    map.addSource('selected-tiles', { type: 'geojson', data });
    map.addLayer({
      id: 'selected-tiles-fill',
      type: 'fill',
      source: 'selected-tiles',
      paint: {
        'fill-color': '#2196F3',
        'fill-opacity': 0.25,
      },
    }, 'tile-grid-fill');
    map.addLayer({
      id: 'selected-tiles-outline',
      type: 'line',
      source: 'selected-tiles',
      paint: {
        'line-color': '#2196F3',
        'line-width': 2,
        'line-opacity': 0.6,
      },
    }, 'tile-grid-fill');
  } else {
    (source as maplibregl.GeoJSONSource).setData(data);
  }
}

/**
 * Set up UI controls
 */
function setupControls(): void {
  // Drawing tool
  const drawButton = document.getElementById('draw-rectangle');
  if (drawButton) {
    drawButton.addEventListener('click', () => {
      if (state.selectionUI) {
        if (!state.isDrawing) {
          state.selectionUI.startAreaSelection();
          state.isDrawing = true;
          drawButton.classList.add('active');
          drawButton.setAttribute('aria-pressed', 'true');
          // Show appropriate message based on input type
          const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
          showToast(isTouchDevice ? 'Touch and drag to select area' : 'Click and drag to select area');
        } else {
          state.selectionUI.stopAreaSelection();
          state.isDrawing = false;
          drawButton.classList.remove('active');
          drawButton.setAttribute('aria-pressed', 'false');
        }
      }
    });
  }

  // Clear selection
  const clearButton = document.getElementById('clear-selection');
  if (clearButton) {
    clearButton.addEventListener('click', () => {
      if (state.selectionUI) {
        state.selectionUI.clearSelection();
      }
      // Clear both old and new selection systems
      state.selectedTiles.clear();
      state.selectionBounds = null;
      state.selectionStore.clearSelection();
      
      // Clear selection box
      if (state.map) {
        const source = state.map.getSource('selection-box') as maplibregl.GeoJSONSource;
        if (source) {
          source.setData({
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'Polygon',
              coordinates: [[]],
            },
          });
        }
      }
      
      // Update UI
      updateSelectionInfo();
      drawTileGrid();
      showToast('Selection cleared');
    });
  }

  // Zoom controls
  const zoomInButton = document.getElementById('zoom-in');
  const zoomOutButton = document.getElementById('zoom-out');
  
  if (zoomInButton && state.map) {
    zoomInButton.addEventListener('click', () => {
      state.map?.zoomIn();
    });
  }
  
  if (zoomOutButton && state.map) {
    zoomOutButton.addEventListener('click', () => {
      state.map?.zoomOut();
    });
  }

  // Fit bounds
  const fitBoundsButton = document.getElementById('fit-bounds');
  if (fitBoundsButton) {
    fitBoundsButton.addEventListener('click', () => {
      if (state.selectionUI) {
        state.selectionUI.fitToSelection();
      } else if (state.map && state.selectionBounds) {
        state.map.fitBounds([
          [state.selectionBounds.west, state.selectionBounds.south],
          [state.selectionBounds.east, state.selectionBounds.north],
        ], { padding: 50 });
      }
    });
  }

  // Settings panel
  const menuToggle = document.getElementById('menu-toggle');
  const settingsPanel = document.getElementById('settings-panel');
  const closeSettings = document.getElementById('close-settings');

  if (menuToggle && settingsPanel) {
    menuToggle.addEventListener('click', () => {
      settingsPanel.classList.toggle('open');
      menuToggle.classList.toggle('active');
    });
  }

  if (closeSettings && settingsPanel) {
    closeSettings.addEventListener('click', () => {
      settingsPanel.classList.remove('open');
      if (menuToggle) {
        menuToggle.classList.remove('active');
      }
    });
  }

  // Info panel close
  const closeInfo = document.getElementById('close-info');
  const infoPanel = document.getElementById('info-panel');
  const infoPeek = document.getElementById('info-peek');
  
  if (closeInfo && infoPanel) {
    closeInfo.addEventListener('click', () => {
      infoPanel.classList.add('hidden');
      try { localStorage.setItem('srtm2tak_info_visible', 'false'); } catch {}
    });
  }

  // Clicking the peek handle or header when hidden restores the panel
  const infoHeader = document.querySelector('.info-header');
  const showInfo = () => {
    if (!infoPanel) return;
    infoPanel.classList.remove('hidden');
    try { localStorage.setItem('srtm2tak_info_visible', 'true'); } catch {}
  };
  if (infoPeek) {
    infoPeek.addEventListener('click', showInfo);
  }
  if (infoHeader) {
    infoHeader.addEventListener('click', () => {
      if (infoPanel?.classList.contains('hidden')) showInfo();
    });
  }

  // Settings controls
  const showGridCheckbox = document.getElementById('show-grid') as HTMLInputElement;
  const showLabelsCheckbox = document.getElementById('show-labels') as HTMLInputElement;
  const useCacheCheckbox = document.getElementById('use-cache') as HTMLInputElement;
  const clearCacheButton = document.getElementById('clear-cache') as HTMLButtonElement;

  // Selection mode controls
  const segModeTile = document.getElementById('seg-mode-tile');
  const segModeBox = document.getElementById('seg-mode-box');
  const segActionAdd = document.getElementById('seg-action-add');
  const segActionRemove = document.getElementById('seg-action-remove');

  const setSegment = (elOn: HTMLElement|null, elOff: HTMLElement|null, on: boolean) => {
    if (elOn) { elOn.setAttribute('aria-pressed', 'true'); elOn.classList.add('active'); }
    if (elOff) { elOff.setAttribute('aria-pressed', 'false'); elOff.classList.remove('active'); }
  };

  if (segModeTile && segModeBox) {
    segModeTile.addEventListener('click', () => {
      // Selection mode no longer used
      setSegment(segModeTile, segModeBox, true);
      // Re-enable one-finger pan/drag in tile mode
      state.map?.dragPan.enable();
      notifications.info('Tile mode: tap tiles to add/remove');
    });
    segModeBox.addEventListener('click', () => {
      // Selection mode no longer used
      setSegment(segModeBox, segModeTile, true);
      // Disable one-finger drag for reliable drawing; two-finger pan still works
      state.map?.dragPan.disable();
      notifications.info('Box mode: drag to add/remove area');
    });
  }

  if (segActionAdd && segActionRemove) {
    segActionAdd.addEventListener('click', () => {
      // Action mode no longer used
      setSegment(segActionAdd, segActionRemove, true);
      notifications.info('Add tiles');
    });
    segActionRemove.addEventListener('click', () => {
      // Action mode no longer used
      setSegment(segActionRemove, segActionAdd, true);
      notifications.info('Remove tiles');
    });
  }
  
  if (showGridCheckbox) {
    showGridCheckbox.addEventListener('change', () => {
      state.settings.showGrid = showGridCheckbox.checked;
      saveSettings();
      if (state.settings.showGrid) {
        drawTileGrid();
      } else if (state.map) {
        // Hide grid layers
        state.map.setLayoutProperty('tile-grid-lines', 'visibility', 'none');
        state.map.setLayoutProperty('tile-grid-fill', 'visibility', 'none');
        state.map.setLayoutProperty('tile-labels', 'visibility', 'none');
      }
    });
  }
  
  if (showLabelsCheckbox) {
    showLabelsCheckbox.addEventListener('change', () => {
      state.settings.showLabels = showLabelsCheckbox.checked;
      saveSettings();
      if (state.settings.showGrid) {
        drawTileGrid();
      }
    });
  }

  if (useCacheCheckbox) {
    // Initialize from settings
    useCacheCheckbox.checked = state.settings.useCache;
    useCacheCheckbox.addEventListener('change', () => {
      state.settings.useCache = useCacheCheckbox.checked;
      saveSettings();
      // Refresh cache overlay info
      void refreshCachedTiles();
    });
  }

  if (clearCacheButton) {
    clearCacheButton.addEventListener('click', async () => {
      clearCacheButton.disabled = true;
      try {
        await clearCachesAndStorage();
        state.cachedTiles.clear();
        state.downloadedTiles.clear();
        state.downloadingTiles.clear();
        state.failedTiles.clear();
        if (state.settings.showGrid) drawTileGrid();
        updateSelectionInfo();
        // Immediately clear cached overlay
        renderCachedTiles();
        await updateStorageInfo();
        notifications.success('Cache cleared');
      } catch (e) {
        notifications.error('Failed to clear cache');
      } finally {
        clearCacheButton.disabled = false;
      }
    });
  }

  // Download button
  const downloadButton = document.getElementById('download-button');
  if (downloadButton) {
    downloadButton.addEventListener('click', () => {
      const selectionState = state.selectionStore.getState();
      if (selectionState.totalTiles > 0 && !state.isDownloading) {
        startDownload();
      }
    });
  }
  
  // Cancel download button
  const cancelButton = document.getElementById('cancel-download');
  if (cancelButton) {
    cancelButton.addEventListener('click', () => {
      if (state.downloadManager && state.isDownloading) {
        console.log('Cancel button clicked - stopping download');

        // Mark as cancelled BEFORE calling cancelDownload
        state.downloadCancelled = true;

        state.downloadManager.cancelDownload();
        hideProgressOverlay();
        state.isDownloading = false;

        // Clear download state
        state.downloadingTiles.clear();
        state.downloadedTiles.clear();
        state.failedTiles.clear();

        // Clear the selection too since download was cancelled
        state.selectedTiles.clear();
        state.selectionStore.clearSelection();

        // Redraw grid to clear colors
        if (state.settings.showGrid) {
          drawTileGrid();
        }

        // Update UI
        updateSelectionInfo();

        notifications.warning('Download cancelled');
      }
    });
  }
}

function saveSettings(): void {
  try {
    localStorage.setItem('srtm2tak_settings', JSON.stringify(state.settings));
  } catch {}
}

function loadSettings(): void {
  try {
    const raw = localStorage.getItem('srtm2tak_settings');
    if (!raw) return;
    const s = JSON.parse(raw);
    state.settings.showGrid = Boolean(s.showGrid ?? state.settings.showGrid);
    state.settings.showLabels = Boolean(s.showLabels ?? state.settings.showLabels);
    state.settings.concurrentDownloads = Number(s.concurrentDownloads ?? state.settings.concurrentDownloads);
    state.settings.useCache = Boolean(s.useCache ?? state.settings.useCache);
  } catch {}
}

async function updateStorageInfo(): Promise<void> {
  try {
    const sm = new StorageManager();
    await sm.init();
    const info = await sm.getStorageInfo();
    const textEl = document.getElementById('storage-text');
    const barEl = document.getElementById('storage-used');
    if (textEl) {
      textEl.textContent = `${formatBytes(info.totalSize)} used${info.tileCount ? ` • ${info.tileCount} tiles` : ''}`;
    }
    if (barEl) {
      let percent = 0;
      if (info.quotaUsed && info.quotaAvailable && info.quotaAvailable > 0) {
        percent = Math.min(100, Math.round((info.quotaUsed / info.quotaAvailable) * 100));
      }
      barEl.style.width = `${percent}%`;
    }
  } catch {
    // ignore
  }
}

async function clearCachesAndStorage(): Promise<void> {
  // Clear IndexedDB tiles via StorageManager
  const sm = new StorageManager();
  try {
    await sm.init();
    await sm.clear();
  } catch {
    // ignore and continue
  }
  // Clear runtime caches for SRTM tiles if present
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      for (const key of keys) {
        if (key === 'srtm-tiles' || key.startsWith('workbox-') || key.startsWith('vite-pwa')) {
          await caches.delete(key);
        }
      }
    }
  } catch {
    // ignore
  }
}

/**
 * Start download process
 */
async function startDownload(): Promise<void> {
  // Get current selection from the new SelectionStore
  const selectionState = state.selectionStore.getState();
  
  if (selectionState.totalTiles === 0) {
    notifications.warning('Please select an area to download');
    return;
  }
  
  if (state.isDownloading) {
    notifications.warning('Download already in progress');
    return;
  }
  
  // Get friendly name from selection store BEFORE starting download
  let filename = 'srtm_tiles';
  
  if (selectionState.friendlyDescription) {
    // Clean the description for use as filename
    // Remove special characters and replace spaces with underscores
    filename = selectionState.friendlyDescription
      .replace(/[^\w\s-]/g, '') // Remove special chars except spaces and hyphens
      .replace(/\s+/g, '_')      // Replace spaces with underscores
      .replace(/_+/g, '_')       // Remove duplicate underscores
      .toLowerCase();
  }
  
  // Store the filename for use in handleDownloadComplete
  state.downloadFilename = `${filename}_${Date.now()}.zip`;
  
  // Show progress overlay
  showProgressOverlay();
  state.isDownloading = true;
  state.downloadCancelled = false;  // Reset cancel flag
  // Reset tile status markers
  state.downloadedTiles.clear();
  state.failedTiles.clear();
  state.downloadingTiles.clear();

  // Add tiles to selectedTiles so color status works
  state.selectedTiles.clear();
  selectionState.requiredTiles.forEach(t => state.selectedTiles.add(t.id));
  
  // Pre-color already-cached tiles (green)
  // Initialize a temporary manager for cache detection if not yet created
  if (!state.downloadManager) {
    state.downloadManager = new DownloadManager({});
  }
  // Get tile IDs from the SelectionStore
  const tileIds = selectionState.requiredTiles.map(t => t.id);
  try {
    const cached = await state.downloadManager.getCachedTiles(tileIds);
    cached.forEach(id => state.downloadedTiles.add(id));
  } catch {
    // ignore cache probe errors
  }
  drawTileGrid();
  
  // Create download manager
  state.downloadManager = new DownloadManager({
    concurrentDownloads: state.settings.concurrentDownloads,
    useCache: state.settings.useCache,
    onTileStart: (tileId: string) => {
      state.downloadingTiles.add(tileId);
      if (state.settings.showGrid) drawTileGrid();
    },
    onProgress: updateProgressDisplay,
    onTileComplete: handleTileComplete,
    onComplete: handleDownloadComplete,
    onError: handleDownloadError,
  });
  
  // Get selected tiles array
  // Use the tileIds we computed above
  
  // Create area selection info
  const selection = {
    id: `selection-${Date.now()}`,
    bounds: selectionState.selectedArea || {
      north: 0,
      south: 0,
      east: 0,
      west: 0,
    },
    tiles: tileIds,
    tileCount: tileIds.length,
    area: selectionState.areaSquareKm || 0,
    estimatedSize: (() => {
      const sizes = estimateFileSizes(tileIds.length);
      return {
        ...sizes,
        formatted: sizes.compressedFormatted
      };
    })(),
    created: new Date(),
  };
  
  try {
    // Start download
    notifications.info(`Starting download of ${tileIds.length} tiles...`);
    console.log(`Starting download of ${tileIds.length} tiles:`, tileIds);
    
    const blob = await state.downloadManager.startDownload(tileIds, selection);
    console.log('Download completed, blob size:', blob.size);
    // Note: DownloadManager already invokes onComplete → handleDownloadComplete.
    // Do not call it again here to avoid duplicate download prompts (seen in Firefox).
  } catch (error) {
    const err = error as any;
    const isAbort = (err?.name === 'AbortError') || (/cancelled/i.test(err?.message || ''));
    if (isAbort) {
      // Already handled by cancel button; avoid duplicate error toast
      return;
    }
    console.error('Download failed:', error);
    handleDownloadError(error as Error);
  }
}

/**
 * Show progress overlay
 */
function showProgressOverlay(): void {
  const overlay = document.getElementById('progress-overlay');
  if (overlay) {
    overlay.style.display = 'flex';
  }
  
  // Reset progress display
  updateProgressDisplay({
    current: 0,
    total: state.selectedTiles.size,
    percent: 0,
    bytesDownloaded: 0,
    bytesTotal: 0,
    speed: 0,
    timeElapsed: 0,
    timeRemaining: 0,
  });
}

/**
 * Hide progress overlay
 */
function hideProgressOverlay(): void {
  const overlay = document.getElementById('progress-overlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

/**
 * Update progress display
 */
function updateProgressDisplay(progress: any): void {
  // Update progress text
  const currentElement = document.getElementById('progress-current');
  const totalElement = document.getElementById('progress-total');
  if (currentElement && totalElement) {
    currentElement.textContent = progress.current.toString();
    totalElement.textContent = progress.total.toString();
  }
  
  // Update progress bar
  const progressBar = document.querySelector('.progress-fill') as HTMLElement;
  if (progressBar) {
    progressBar.style.width = `${progress.percent}%`;
  }
  
  // Update speed
  const speedElement = document.getElementById('download-speed');
  if (speedElement) {
    const speedMBps = (progress.speed / (1024 * 1024)).toFixed(1);
    speedElement.textContent = `${speedMBps} MB/s`;
  }
  
  // Update time remaining
  const timeElement = document.getElementById('time-remaining');
  if (timeElement) {
    if (progress.timeRemaining > 0) {
      const seconds = Math.floor(progress.timeRemaining / 1000);
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      timeElement.textContent = `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    } else {
      timeElement.textContent = '--:--';
    }
  }
}

/**
 * Handle tile completion
 */
function handleTileComplete(tileId: string, success: boolean): void {
  if (success) {
    state.downloadedTiles.add(tileId);
    state.failedTiles.delete(tileId);
    console.log(`Tile ${tileId} downloaded successfully`);
  } else {
    state.failedTiles.add(tileId);
    state.downloadedTiles.delete(tileId);
    console.warn(`Failed to download tile ${tileId}`);
  }
  // No longer downloading
  state.downloadingTiles.delete(tileId);
  // Refresh grid colors
  if (state.settings.showGrid) {
    drawTileGrid();
  }
}

/**
 * Handle download completion
 */
function handleDownloadComplete(blob: Blob): void {
  hideProgressOverlay();
  state.isDownloading = false;

  // Don't save file if download was cancelled
  if (state.downloadCancelled) {
    console.log('Download was cancelled, not saving file');
    state.downloadCancelled = false;  // Reset flag
    return;
  }

  // Update storage info after download completes
  void updateStorageInfo();

  // Create download link with friendly name
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;

  // Use the filename we stored at the start of download
  a.download = state.downloadFilename || `srtm_tiles_${Date.now()}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  // Clear the stored filename
  state.downloadFilename = null;
  
  // Show success notification
  const selectionState = state.selectionStore.getState();
  notifications.success(
    `Download complete! ${selectionState.totalTiles} tiles saved.`,
    {
      duration: 10000,
      action: {
        label: 'Clear Selection',
        callback: () => {
          // Clear both old and new selection systems
          state.selectedTiles.clear();
          state.selectionBounds = null;
          state.selectionStore.clearSelection();
          if (state.selectionUI) {
            state.selectionUI.clearSelection();
          }
          drawTileGrid();
          updateSelectionInfo();
        },
      },
    }
  );
}

/**
 * Handle download error
 */
function handleDownloadError(error: Error): void {
  hideProgressOverlay();
  state.isDownloading = false;
  
  notifications.error(
    `Download failed: ${error.message}`,
    {
      duration: 10000,
      action: {
        label: 'Retry',
        callback: () => startDownload(),
      },
    }
  );
}

/**
 * Fix broken SVG icons with proper, intuitive designs
 */
function fixBrokenIcons(): void {
  // Fix all the malformed/empty SVG icons with proper designs
  
  // Selection box icon (intuitive area selection with corner handles)
  const drawBtn = document.querySelector('#draw-rectangle svg');
  if (drawBtn) {
    drawBtn.setAttribute('fill', 'none');
    drawBtn.setAttribute('stroke', 'currentColor');
    drawBtn.innerHTML = `
      <!-- Dashed selection rectangle -->
      <rect x="5" y="7" width="14" height="10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3,2" opacity="0.8"/>
      <!-- Corner handles for clarity -->
      <rect x="3" y="5" width="4" height="4" fill="currentColor" rx="0.5"/>
      <rect x="17" y="5" width="4" height="4" fill="currentColor" rx="0.5"/>
      <rect x="3" y="15" width="4" height="4" fill="currentColor" rx="0.5"/>
      <rect x="17" y="15" width="4" height="4" fill="currentColor" rx="0.5"/>
    `;
  }
  
  // Clear/trash icon
  const clearBtn = document.querySelector('#clear-selection svg');
  if (clearBtn) {
    clearBtn.setAttribute('fill', 'none');
    clearBtn.setAttribute('stroke', 'currentColor');
    clearBtn.innerHTML = `
      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" stroke-width="2"/>
      <path d="M10 11v6M14 11v6" stroke-width="2" stroke-linecap="round"/>
    `;
  }
  
  // Info circle icon
  const infoBtn = document.querySelector('#toggle-info svg');
  if (infoBtn) {
    infoBtn.setAttribute('fill', 'none');
    infoBtn.setAttribute('stroke', 'currentColor');
    infoBtn.innerHTML = `
      <circle cx="12" cy="12" r="10" stroke-width="2"/>
      <path d="M12 16v-4M12 8h.01" stroke-width="2" stroke-linecap="round"/>
    `;
  }
  
  // Zoom in (magnifying glass with +)
  const zoomInBtn = document.querySelector('#zoom-in svg');
  if (zoomInBtn) {
    zoomInBtn.setAttribute('fill', 'none');
    zoomInBtn.setAttribute('stroke', 'currentColor');
    zoomInBtn.innerHTML = `
      <circle cx="11" cy="11" r="8" stroke-width="2"/>
      <path d="M21 21l-4.35-4.35M11 8v6M8 11h6" stroke-width="2" stroke-linecap="round"/>
    `;
  }
  
  // Zoom out (magnifying glass with -)
  const zoomOutBtn = document.querySelector('#zoom-out svg');
  if (zoomOutBtn) {
    zoomOutBtn.setAttribute('fill', 'none');
    zoomOutBtn.setAttribute('stroke', 'currentColor');
    zoomOutBtn.innerHTML = `
      <circle cx="11" cy="11" r="8" stroke-width="2"/>
      <path d="M21 21l-4.35-4.35M8 11h6" stroke-width="2" stroke-linecap="round"/>
    `;
  }
  
  // Fit to selection (expand corners)
  const fitBtn = document.querySelector('#fit-bounds svg');
  if (fitBtn) {
    fitBtn.setAttribute('fill', 'none');
    fitBtn.setAttribute('stroke', 'currentColor');
    fitBtn.innerHTML = `
      <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" stroke-width="2" stroke-linecap="round"/>
    `;
  }
  
  // Download icon (arrow down to tray)
  const downloadBtn = document.querySelector('#download-tiles svg');
  if (downloadBtn) {
    downloadBtn.setAttribute('fill', 'none');
    downloadBtn.setAttribute('stroke', 'currentColor');
    downloadBtn.innerHTML = `
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke-width="2" stroke-linecap="round"/>
    `;
  }
  
  // Menu hamburger icon
  const menuBtn = document.querySelector('#menu-toggle svg');
  if (menuBtn) {
    menuBtn.setAttribute('fill', 'none');
    menuBtn.setAttribute('stroke', 'currentColor');
    menuBtn.innerHTML = `
      <path d="M3 12h18M3 6h18M3 18h18" stroke-width="2" stroke-linecap="round"/>
    `;
  }
  
  // Improve tooltips
  const betterTooltips = {
    'draw-rectangle': 'Draw selection box (click and drag)',
    'clear-selection': 'Clear all selections',
    'toggle-info': 'Toggle selection panel',
    'zoom-in': 'Zoom in',
    'zoom-out': 'Zoom out',
    'fit-bounds': 'Fit to selection',
    'download-tiles': 'Download selected tiles',
    'menu-toggle': 'Settings'
  };
  
  Object.entries(betterTooltips).forEach(([id, text]) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.setAttribute('title', text);
      btn.setAttribute('aria-label', text);
    }
  });
}

/**
 * Initialize the application
 */
function initialize(): void {
  // Load persisted settings first
  loadSettings();
  
  // Fix the broken icons immediately
  fixBrokenIcons();
  
  // Hide loading screen
  const loadingScreen = document.getElementById('loading');
  const appContainer = document.getElementById('app');
  
  if (loadingScreen && appContainer) {
    loadingScreen.style.display = 'none';
    appContainer.style.display = 'flex';
  }

  // Initialize map
  initializeMap();

  // Set up controls
  setupControls();

  // Apply initial control states from settings
  const showGridCheckbox = document.getElementById('show-grid') as HTMLInputElement | null;
  if (showGridCheckbox) showGridCheckbox.checked = state.settings.showGrid;
  const showLabelsCheckbox = document.getElementById('show-labels') as HTMLInputElement | null;
  if (showLabelsCheckbox) showLabelsCheckbox.checked = state.settings.showLabels;
  const useCacheCheckbox = document.getElementById('use-cache') as HTMLInputElement | null;
  if (useCacheCheckbox) useCacheCheckbox.checked = state.settings.useCache;

  // Initial UI update
  updateSelectionInfo();
  void updateStorageInfo();
  // Render selected overlay early once map is ready (renderSelectedTiles is called on load too)
  renderAreasPanel();
  // Ensure info panel at least peeks (never fully hidden)
  const infoPanelInit = document.getElementById('info-panel');
  if (infoPanelInit) {
    const raw = localStorage.getItem('srtm2tak_info_visible');
    if (raw === null) {
      const visible = state.selectedTiles.size > 0;
      infoPanelInit.classList.toggle('hidden', !visible);
      try { localStorage.setItem('srtm2tak_info_visible', visible ? 'true' : 'false'); } catch {}
    } else if (raw === 'false') {
      infoPanelInit.classList.add('hidden');
    } else {
      infoPanelInit.classList.remove('hidden');
    }
  }
  // Restore info panel visibility
  const infoPanel = document.getElementById('info-panel');
  if (infoPanel) {
    try {
      const raw = localStorage.getItem('srtm2tak_info_visible');
      if (raw !== null) {
        const visible = raw === 'true';
        infoPanel.classList.toggle('hidden', !visible);
      }
    } catch {}
  }
  
  // Register service worker
  registerServiceWorker();
  
  // Set up offline detection
  setupOfflineDetection();
}

/**
 * Register service worker for PWA functionality
 */
async function registerServiceWorker(): Promise<void> {
  // Skip SW in dev to avoid 404s; only register in production builds
  const isDev = (import.meta as any)?.env?.DEV === true || (import.meta as any)?.env?.MODE === 'development';
  if ('serviceWorker' in navigator && !isDev) {
    try {
      const base = (import.meta as any)?.env?.BASE_URL ?? '/';
      const swUrl = computeServiceWorkerUrl(base);
      const registration = await navigator.serviceWorker.register(swUrl);
      console.log('Service Worker registered:', registration.scope);
      
      // Check for updates periodically
      setInterval(() => {
        registration.update();
      }, 60000); // Check every minute
      
      // Handle updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New service worker available
              notifications.info('Update available! Refresh to get the latest version.', {
                persistent: true,
                action: {
                  label: 'Refresh',
                  callback: () => window.location.reload(),
                },
              });
            }
          });
        }
      });
    } catch (error) {
      console.warn('Service Worker registration failed (non-fatal):', error);
    }
  }
}

/**
 * Set up offline detection
 */
function setupOfflineDetection(): void {
  const offlineIndicator = document.getElementById('offline-indicator');
  
  const updateOnlineStatus = () => {
    if (navigator.onLine) {
      offlineIndicator?.style.setProperty('display', 'none');
      notifications.success('Connection restored');
    } else {
      offlineIndicator?.style.setProperty('display', 'flex');
      notifications.warning('You are offline. Some features may be limited.');
    }
  };
  
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  
  // Check initial status
  if (!navigator.onLine) {
    offlineIndicator?.style.setProperty('display', 'flex');
  }
}

// Start app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
