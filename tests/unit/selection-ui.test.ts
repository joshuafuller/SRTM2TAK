/**
 * SelectionUI on a real Leaflet map (jsdom): area selection by drag only
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as L from 'leaflet';
import { SelectionUI } from '../../src/lib/selection-ui';
import { SelectionStore } from '../../src/lib/selection-system';

function pointer(type: string, x: number, y: number, extra: Partial<PointerEventInit> = {}): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
    isPrimary: true,
    pointerId: 1,
    ...extra,
  });
}

describe('SelectionUI (Leaflet)', () => {
  let container: HTMLDivElement;
  let map: L.Map;
  let store: SelectionStore;
  let ui: SelectionUI;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    map = L.map(container, { center: [38.5, -105.5], zoom: 6 });
    store = new SelectionStore();
    ui = new SelectionUI({ map, selectionStore: store });
  });

  afterEach(() => {
    map.remove();
    container.remove();
  });

  function drag(from: [number, number], to: [number, number]): void {
    container.dispatchEvent(pointer('pointerdown', ...from));
    container.dispatchEvent(pointer('pointermove', (from[0] + to[0]) / 2, (from[1] + to[1]) / 2));
    container.dispatchEvent(pointer('pointermove', ...to));
    container.dispatchEvent(pointer('pointerup', ...to));
  }

  it('selection mode disables panning, blocks touch gestures, and shows a crosshair', () => {
    ui.startAreaSelection();
    expect(map.dragging.enabled()).toBe(false);
    expect(container.style.touchAction).toBe('none');
    expect(container.style.cursor).toBe('crosshair');

    ui.stopAreaSelection();
    expect(map.dragging.enabled()).toBe(true);
    expect(container.style.touchAction).toBe('');
    expect(container.style.cursor).toBe('');
  });

  it('a drag in selection mode selects the area under the box', () => {
    ui.startAreaSelection();
    drag([-100, -100], [100, 100]);

    const state = store.getState();
    expect(state.selectedArea).not.toBeNull();
    const expectedSw = map.containerPointToLatLng(L.point(-100, 100));
    const expectedNe = map.containerPointToLatLng(L.point(100, -100));
    expect(state.selectedArea!.south).toBeCloseTo(expectedSw.lat, 6);
    expect(state.selectedArea!.west).toBeCloseTo(expectedSw.lng, 6);
    expect(state.selectedArea!.north).toBeCloseTo(expectedNe.lat, 6);
    expect(state.selectedArea!.east).toBeCloseTo(expectedNe.lng, 6);
    expect(state.totalTiles).toBeGreaterThan(0);
  });

  it('ignores tiny movements (accidental clicks)', () => {
    ui.startAreaSelection();
    drag([0, 0], [3, 4]);
    expect(store.getState().selectedArea).toBeNull();
  });

  it('does not select anything when selection mode is off', () => {
    drag([-100, -100], [100, 100]);
    expect(store.getState().selectedArea).toBeNull();
  });

  it('shows a box while dragging and removes it on release', () => {
    ui.startAreaSelection();
    container.dispatchEvent(pointer('pointerdown', 0, 0));
    container.dispatchEvent(pointer('pointermove', 50, 40));
    const box = container.querySelector<HTMLDivElement>('.selection-box');
    expect(box).not.toBeNull();
    expect(box!.style.width).toBe('50px');
    expect(box!.style.height).toBe('40px');

    container.dispatchEvent(pointer('pointerup', 50, 40));
    expect(container.querySelector('.selection-box')).toBeNull();
  });

  it('prevents the browser default on pointerdown (no pull-to-refresh)', () => {
    ui.startAreaSelection();
    const down = pointer('pointerdown', 0, 0);
    container.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
  });

  it('ignores a second finger or a non-primary button', () => {
    ui.startAreaSelection();
    container.dispatchEvent(pointer('pointerdown', 0, 0, { isPrimary: false, pointerId: 2 }));
    container.dispatchEvent(pointer('pointerdown', 0, 0, { button: 2 }));
    expect(container.querySelector('.selection-box')).toBeNull();
  });

  it('captures the pointer on the map container, not on a tile image', () => {
    const capture = vi.fn();
    (container as any).setPointerCapture = capture;
    ui.startAreaSelection();
    // The press lands on a map tile image inside the container
    const tile = document.createElement('img');
    (tile as any).setPointerCapture = vi.fn();
    container.appendChild(tile);
    tile.dispatchEvent(pointer('pointerdown', 0, 0, { pointerId: 7 }));
    expect(capture).toHaveBeenCalledWith(7);
  });

  it('ignores move and up events from a second finger while drawing', () => {
    ui.startAreaSelection();
    container.dispatchEvent(pointer('pointerdown', 0, 0, { pointerId: 1 }));
    container.dispatchEvent(pointer('pointermove', 60, 60, { pointerId: 1 }));
    // A second finger touches, moves and lifts first
    container.dispatchEvent(pointer('pointermove', 300, 300, { pointerId: 2, isPrimary: false }));
    container.dispatchEvent(pointer('pointerup', 300, 300, { pointerId: 2, isPrimary: false }));
    const box = container.querySelector<HTMLDivElement>('.selection-box');
    expect(box).not.toBeNull();
    expect(box!.style.width).toBe('60px');
    expect(store.getState().selectedArea).toBeNull();

    // The first finger ends the box
    container.dispatchEvent(pointer('pointerup', 60, 60, { pointerId: 1 }));
    expect(store.getState().selectedArea).not.toBeNull();
  });

  it('clearSelection empties the store', () => {
    store.selectArea({ south: 38, north: 39, west: -106, east: -105 });
    ui.clearSelection();
    expect(store.getState().selectedArea).toBeNull();
  });

  it('fitToSelection fits the map to the selected area', () => {
    const fit = vi.spyOn(map, 'fitBounds');
    store.selectArea({ south: 38, north: 39, west: -106, east: -105 });
    ui.fitToSelection();
    expect(fit).toHaveBeenCalledWith([[38, -106], [39, -105]], expect.objectContaining({ padding: [50, 50] }));
  });

  it('fitToSelection does nothing without a selection', () => {
    const fit = vi.spyOn(map, 'fitBounds');
    ui.fitToSelection();
    expect(fit).not.toHaveBeenCalled();
  });
});

describe('SelectionUI tile overlay on repeated world copies', () => {
  let container: HTMLDivElement;
  let map: L.Map;
  let store: SelectionStore;
  let ui: SelectionUI;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    map = L.map(container, { center: [38.5, 254.5], zoom: 6 });
    store = new SelectionStore();
    ui = new SelectionUI({ map, selectionStore: store });
  });

  afterEach(() => {
    map.remove();
    container.remove();
  });

  it('draws tile highlights in the world copy where the box was drawn', () => {
    // Pikes Peak drawn one world copy to the east (lng -105.5 + 360)
    store.selectArea({ south: 38.1, north: 38.5, west: 254.5, east: 254.9 });
    const bounds = (ui as any).tilesLayer.getBounds() as L.LatLngBounds;
    expect(bounds.getWest()).toBe(254);
    expect(bounds.getEast()).toBe(255);
  });

  it('keeps both sides of a selection across 180° next to each other', () => {
    store.selectArea({ south: 0.2, north: 0.5, west: 179.5, east: 180.5 });
    const bounds = (ui as any).tilesLayer.getBounds() as L.LatLngBounds;
    expect(bounds.getWest()).toBe(179);
    expect(bounds.getEast()).toBe(181);
  });
});
