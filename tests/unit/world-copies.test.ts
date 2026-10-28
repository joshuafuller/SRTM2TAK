import { describe, it, expect } from 'vitest';
import { buildCachedGeoJSONForView } from '@/lib/cached-overlay';

const bboxOf = (fc: { features: Array<{ geometry: { coordinates: number[][][] } }> }) =>
  fc.features.map((f) => {
    const lngs = f.geometry.coordinates[0].map((c) => c[0]);
    return [Math.min(...lngs), Math.max(...lngs)];
  });

describe('buildCachedGeoJSONForView', () => {
  it('places cached tiles in the world copy that is on screen', () => {
    const fc = buildCachedGeoJSONForView(['N38W106'], { north: 40, south: 37, west: 250, east: 258 });
    expect(bboxOf(fc)).toEqual([[254, 255]]);
  });

  it('shows a tile in each world copy that is on screen', () => {
    const fc = buildCachedGeoJSONForView(['N00E179'], { north: 1, south: -1, west: -200, east: 200 });
    expect(bboxOf(fc).sort((a, b) => a[0] - b[0])).toEqual([[-181, -180], [179, 180]]);
  });

  it('keeps the normal world unchanged', () => {
    const fc = buildCachedGeoJSONForView(['N38W106'], { north: 40, south: 37, west: -110, east: -100 });
    expect(bboxOf(fc)).toEqual([[-106, -105]]);
  });
});
