import { describe, it, expect } from 'vitest';
import { MAP_ZOOM, degreesPerPixel } from '@/app/map-zoom';

// The MapLibre version (before Leaflet) used these zoom numbers with 512 px tiles.
// Pin the same map scale (degrees per screen pixel), not the zoom number.
const MAPLIBRE = { start: 4, min: 2, max: 10, grid: 5, labels: 7 };
const maplibreScale = (zoom: number) => 360 / (512 * 2 ** zoom);

describe('map zoom levels keep the MapLibre scale', () => {
  it.each(Object.keys(MAPLIBRE) as Array<keyof typeof MAPLIBRE>)('%s', (key) => {
    expect(degreesPerPixel(MAP_ZOOM[key])).toBeCloseTo(maplibreScale(MAPLIBRE[key]), 12);
  });
});
