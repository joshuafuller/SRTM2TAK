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
