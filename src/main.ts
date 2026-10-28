/**
 * SRTM2TAK Main Application Entry Point
 */

import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './styles/main.css';
import { DownloadManager } from './lib/download-manager';
import { StorageManager } from './lib/storage-manager';
import { notifications } from './lib/notification-manager';
import { estimateFileSizes, formatBytes, largeDownloadLimit, latLonToTileId } from './lib/tile-utils';
import { buildCachedGeoJSONForView } from './lib/cached-overlay';
import { SelectionStore } from './lib/selection-system';
import { SelectionUI } from './lib/selection-ui';
import { showToast, showZoomMessage, hideZoomMessage } from './ui/notices';
import { showProgressOverlay, hideProgressOverlay, updateProgressDisplay } from './ui/progress-overlay';
import { fixBrokenIcons } from './ui/icons';
import { type AppSettings, saveSettings, loadSettings } from './app/settings';
import { registerServiceWorker, setupOfflineDetection } from './app/pwa';

// Application state
interface AppState {
  map: L.Map | null;
  selectedTiles: Set<string>;
  downloadingTiles: Set<string>;
  downloadedTiles: Set<string>; // tiles that completed successfully (including cache hits)
  failedTiles: Set<string>;     // tiles that failed or were ocean/missing
  cachedTiles: Set<string>;     // tiles present in cache
  selectionBounds: { north: number; south: number; east: number; west: number } | null;
  isDrawing: boolean;
  // Leaflet overlay layers (created once, refilled on each redraw)
  gridLayer: L.GeoJSON | null;
  labelLayer: L.LayerGroup | null;
  cachedLayer: L.GeoJSON | null;
  selectedLayer: L.GeoJSON | null;
  downloadManager: DownloadManager | null;
  isDownloading: boolean;
  downloadCancelled: boolean;  // Track if download was cancelled
  downloadFilename: string | null; // Store filename for current download
  selectionStore: SelectionStore;
  selectionUI: SelectionUI | null;
  settings: AppSettings;
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
  gridLayer: null,
  labelLayer: null,
  cachedLayer: null,
  selectedLayer: null,
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
 * Initialize the Leaflet map. Leaflet draws with DOM and canvas, so the map
 * works without WebGL (MapLibre 6 needed WebGL2 and broke some Firefox setups).
 */
function initializeMap(): void {
  // Get map container
  const mapElement = document.getElementById('map');
  if (!mapElement) {
    console.error('Map container not found');
    return;
  }

  const map = L.map(mapElement, {
    center: [39.8283, -98.5795], // Center of USA [lat, lng]
    zoom: 4,
    minZoom: 2,
    maxZoom: 10,
    zoomControl: false, // the app has its own zoom buttons
    preferCanvas: true, // one canvas for the many grid polygons
  });
  state.map = map;

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  // Layer order: coverage, cached, selected, grid, labels
  addSRTMCoverage();
  state.cachedLayer = L.geoJSON(undefined, {
    interactive: false,
    style: { color: '#2ecc71', weight: 1, opacity: 0.4, fillColor: '#2ecc71', fillOpacity: 0.2 },
  }).addTo(map);
  state.selectedLayer = L.geoJSON(undefined, {
    interactive: false,
    style: { color: '#2196F3', weight: 2, opacity: 0.6, fillColor: '#2196F3', fillOpacity: 0.25 },
  }).addTo(map);
  state.gridLayer = L.geoJSON(undefined, { interactive: false, style: tileGridStyle });
  state.labelLayer = L.layerGroup();

  // Initialize tile grid
  if (state.settings.showGrid) {
    drawTileGrid();
  }

  // Initialize selection UI
  state.selectionUI = new SelectionUI({
    map,
    selectionStore: state.selectionStore,
    onSelectionChange: (selectionState) => {
      // Update UI based on selection state
      updateSelectionInfo(selectionState);
    }
  });

  // Load all cached tiles so they render as cached on the map
  void loadAllCachedTiles();
  // Initial render of cached tiles overlay
  renderCachedTiles();

  // Set up map event handlers
  setupMapEvents();
}

/**
 * Add SRTM coverage overlay
 */
function addSRTMCoverage(): void {
  if (!state.map) return;

  // SRTM coverage area (60°N to 56°S)
  L.rectangle([[-56, -180], [60, 180]], {
    interactive: false,
    color: '#2196F3',
    weight: 2,
    opacity: 0.3,
    fillColor: '#2196F3',
    fillOpacity: 0.05,
  }).addTo(state.map);
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

const STATUS_COLORS: Record<string, string> = {
  downloading: '#f1c40f', // yellow
  success: '#2ecc71',     // green
  cached: '#2ecc71',      // green
  failed: '#e74c3c',      // red
  pending: '#2196F3',     // blue
};

/**
 * Style of one grid cell by its download status
 */
function tileGridStyle(feature?: GeoJSON.Feature): L.PathOptions {
  const status: string = feature?.properties?.status ?? 'idle';
  const selected = Boolean(feature?.properties?.selected);
  const color = STATUS_COLORS[status] ?? '#666';
  const fillOpacity: Record<string, number> = { idle: 0, downloading: 0.6, success: 0.5, cached: 0.5 };
  const lineOpacity: Record<string, number> = { downloading: 1, success: 0.9, cached: 0.9 };
  return {
    color,
    weight: status === 'downloading' ? 3 : selected ? 2 : 1,
    opacity: lineOpacity[status] ?? (selected ? 0.8 : 0.3),
    fillColor: STATUS_COLORS[status] ?? '#2196F3',
    fillOpacity: fillOpacity[status] ?? 0.35,
  };
}

/**
 * Draw SRTM tile grid on the map
 */
function drawTileGrid(): void {
  const map = state.map;
  if (!map || !state.gridLayer || !state.labelLayer) return;
  // Many callers redraw the grid; it must stay hidden while "Show grid" is off
  if (!state.settings.showGrid) {
    hideTileGrid();
    return;
  }

  const gridData = generateTileGridGeoJSON();
  const cells = gridData.features.filter((f: GeoJSON.Feature) => f.geometry.type === 'Polygon');
  const labels = gridData.features.filter((f: GeoJSON.Feature) => f.geometry.type === 'Point');

  state.gridLayer.clearLayers();
  state.gridLayer.addData({ type: 'FeatureCollection', features: cells } as GeoJSON.FeatureCollection);
  if (!map.hasLayer(state.gridLayer)) state.gridLayer.addTo(map);

  state.labelLayer.clearLayers();
  if (state.settings.showLabels) {
    for (const label of labels) {
      const [lng, lat] = (label.geometry as GeoJSON.Point).coordinates;
      L.marker([lat, lng], {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({ className: 'tile-label', html: String(label.properties?.label ?? ''), iconSize: undefined }),
      }).addTo(state.labelLayer);
    }
  }
  if (!map.hasLayer(state.labelLayer)) state.labelLayer.addTo(map);
}

/**
 * Hide the grid and its labels
 */
function hideTileGrid(): void {
  if (!state.map) return;
  if (state.gridLayer) state.map.removeLayer(state.gridLayer);
  if (state.labelLayer) state.map.removeLayer(state.labelLayer);
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

  // Redraw grid on zoom/move (Leaflet fires moveend after a zoom too)
  state.map.on('moveend', () => {
    if (state.settings.showGrid) {
      drawTileGrid();
    }
     renderCachedTiles();
     renderSelectedTiles();
  });
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
    // Add to the global set: it also holds cached tiles outside this selection
    for (const id of set) state.cachedTiles.add(id);
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
    // IDs only: loading every tile would read the whole cache into memory
    state.cachedTiles = new Set(await sm.getTileIds());
    if (state.settings.showGrid) drawTileGrid();
    renderCachedTiles();
  } catch {
    // If storage unavailable, ignore
  }
}

/**
 * Viewport bounds of the map as plain numbers
 */
function viewportBounds(map: L.Map): { north: number; south: number; east: number; west: number } {
  const b = map.getBounds();
  return { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() };
}

/**
 * Render cached tiles overlay for all zoom levels
 */
function renderCachedTiles(): void {
  if (!state.map || !state.cachedLayer) return;
  state.cachedLayer.clearLayers();
  state.cachedLayer.addData(buildCachedGeoJSONForView(state.cachedTiles, viewportBounds(state.map)));
}

/** Render selected tiles overlay (all zooms) */
function renderSelectedTiles(): void {
  if (!state.map || !state.selectedLayer) return;
  state.selectedLayer.clearLayers();
  state.selectedLayer.addData(buildCachedGeoJSONForView(state.selectedTiles, viewportBounds(state.map)));
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
          [state.selectionBounds.south, state.selectionBounds.west],
          [state.selectionBounds.north, state.selectionBounds.east],
        ], { padding: [50, 50] });
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

  // Map control button shows or hides the panel
  const toggleInfo = document.getElementById('toggle-info');
  if (toggleInfo && infoPanel) {
    toggleInfo.addEventListener('click', () => {
      const visible = infoPanel.classList.toggle('hidden') === false;
      try { localStorage.setItem('srtm2tak_info_visible', visible ? 'true' : 'false'); } catch {}
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
  const concurrentDownloadsSelect = document.getElementById('concurrent-downloads') as HTMLSelectElement;
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
      state.map?.dragging.enable();
      notifications.info('Tile mode: tap tiles to add/remove');
    });
    segModeBox.addEventListener('click', () => {
      // Selection mode no longer used
      setSegment(segModeBox, segModeTile, true);
      // Disable one-finger drag for reliable drawing; two-finger pan still works
      state.map?.dragging.disable();
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
      saveSettings(state.settings);
      if (state.settings.showGrid) {
        drawTileGrid();
      } else {
        hideTileGrid();
      }
    });
  }
  
  if (showLabelsCheckbox) {
    showLabelsCheckbox.addEventListener('change', () => {
      state.settings.showLabels = showLabelsCheckbox.checked;
      saveSettings(state.settings);
      if (state.settings.showGrid) {
        drawTileGrid();
      }
    });
  }

  if (concurrentDownloadsSelect) {
    // Initialize from settings
    concurrentDownloadsSelect.value = state.settings.concurrentDownloads.toString();
    concurrentDownloadsSelect.addEventListener('change', () => {
      state.settings.concurrentDownloads = parseInt(concurrentDownloadsSelect.value, 10);
      saveSettings(state.settings);
      console.log('Updated concurrent downloads to:', state.settings.concurrentDownloads);
    });
  }

  if (useCacheCheckbox) {
    // Initialize from settings
    useCacheCheckbox.checked = state.settings.useCache;
    useCacheCheckbox.addEventListener('change', () => {
      state.settings.useCache = useCacheCheckbox.checked;
      saveSettings(state.settings);
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
  // Clear the service worker's tile cache. Keep the Workbox precache: it holds
  // the app shell, and the app does not load offline without it.
  try {
    if ('caches' in window) {
      await caches.delete('srtm-tiles');
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

  // The ZIP is built in memory: ask before a download that can exhaust it
  const limit = largeDownloadLimit({
    coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
    deviceMemoryGb: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
  });
  if (selectionState.totalTiles > limit) {
    const size = estimateFileSizes(selectionState.totalTiles).compressedFormatted;
    const proceed = window.confirm(
      `You selected ${selectionState.totalTiles} tiles (about ${size}). ` +
      `The ZIP is built in memory, and a download this large can fail on this device. ` +
      `Select a smaller area, or press OK to continue.`
    );
    if (!proceed) return;
  }
  
  // Get friendly name from selection store BEFORE starting download
  let filename = 'srtm_tiles';

  if (selectionState.friendlyDescription && selectionState.friendlyDescription.trim()) {
    const description = selectionState.friendlyDescription.trim();

    // Special handling for "N tiles" pattern (just a number and "tiles")
    const simpleTilePattern = /^(\d+)\s+tiles?$/i;
    const match = description.match(simpleTilePattern);

    if (match) {
      // For simple counts, prepend "srtm_" to make it clear what kind of tiles
      // Validate the number is reasonable
      const tileCount = parseInt(match[1], 10);
      if (tileCount > 0 && tileCount <= 10000) {
        filename = `srtm_${tileCount}_tiles`;
      }
    } else {
      // Security: Use strict whitelist approach for filename sanitization
      // Only allow alphanumeric, spaces, brackets, hyphens, and underscores
      filename = description
        .substring(0, 200)  // Limit length to prevent overflow
        .replace(/\(/g, '[')
        .replace(/\)/g, ']')
        .replace(/[^a-zA-Z0-9\s[\]_-]/g, '')  // Strict whitelist
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^[_-]+|[_-]+$/g, '')  // Trim special chars from start/end
        .toLowerCase();

      // Security: Additional validation
      if (!filename || filename.length === 0 || /^[\d_-]+$/.test(filename)) {
        filename = 'srtm_tiles';
      }

      // Security: Prevent directory traversal patterns
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        filename = 'srtm_tiles';
      }
    }
  }

  // Store the filename for use in handleDownloadComplete
  state.downloadFilename = `${filename}_${Date.now()}.zip`;
  
  // Show progress overlay
  showProgressOverlay(selectionState.totalTiles);
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
  
  // Set when the manager already reported an error, so the catch below does not repeat it
  let errorReported = false;
  // Create download manager. Its callbacks act only while it is the current,
  // not-cancelled download, so a cancelled run cannot touch a newer one.
  const manager: DownloadManager = new DownloadManager({
    concurrentDownloads: state.settings.concurrentDownloads,
    useCache: state.settings.useCache,
    onTileStart: (tileId: string) => {
      if (!isActiveDownload(manager)) return;
      state.downloadingTiles.add(tileId);
      if (state.settings.showGrid) drawTileGrid();
    },
    onProgress: (progress) => {
      if (isActiveDownload(manager)) updateProgressDisplay(progress);
    },
    onTileComplete: (tileId, success) => {
      if (isActiveDownload(manager)) handleTileComplete(tileId, success);
    },
    onComplete: (blob, result) => {
      if (isActiveDownload(manager)) handleDownloadComplete(blob, result.failedTiles);
    },
    onError: (error) => {
      errorReported = true;
      if (isActiveDownload(manager)) handleDownloadError(error);
    },
  });
  state.downloadManager = manager;
  
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
    // Errors from setup (before the manager's own try) reach only this catch
    if (!errorReported && isActiveDownload(manager)) handleDownloadError(error as Error);
  }
}

/**
 * True while this manager runs the current download and was not cancelled
 */
function isActiveDownload(manager: DownloadManager): boolean {
  return state.downloadManager === manager && !manager.isCancelled();
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
function handleDownloadComplete(blob: Blob, failedTiles: string[] = []): void {
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
  // Some browsers start reading a large blob after click() returns
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  
  // Clear the stored filename
  state.downloadFilename = null;
  
  // Show success notification
  const selectionState = state.selectionStore.getState();
  if (failedTiles.length > 0) {
    notifications.warning(
      `${failedTiles.length} of ${selectionState.totalTiles} tiles failed and are not in the ZIP: ${failedTiles.join(', ')}. Download again to retry them.`,
      { duration: 15000 }
    );
  }
  notifications.success(
    `Download complete! ${selectionState.totalTiles - failedTiles.length} tiles saved.`,
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
 * Initialize the application
 */
function initialize(): void {
  // Load persisted settings first
  loadSettings(state.settings);
  
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
  const concurrentDownloadsSelect = document.getElementById('concurrent-downloads') as HTMLSelectElement | null;
  if (concurrentDownloadsSelect) concurrentDownloadsSelect.value = state.settings.concurrentDownloads.toString();
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
  registerServiceWorker({ isBusy: () => state.isDownloading || state.selectionStore.getState().totalTiles > 0 });
  
  // Set up offline detection
  setupOfflineDetection();
}

// Start app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
