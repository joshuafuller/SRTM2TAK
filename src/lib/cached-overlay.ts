import { getTileBounds } from './tile-utils';

export interface ViewportBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface GeoJSONFeature {
  type: 'Feature';
  properties: { tileId: string };
  geometry: {
    type: 'Polygon';
    coordinates: number[][][];
  };
}

interface FeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

export function buildCachedGeoJSON(
  cachedIds: Iterable<string>,
  viewport: ViewportBounds
): FeatureCollection {
  const features: GeoJSONFeature[] = [];
  for (const tileId of cachedIds) {
    const b = getTileBounds(tileId);
    if (!b) continue;
    const intersects = !(
      b.west > viewport.east ||
      b.east < viewport.west ||
      b.south > viewport.north ||
      b.north < viewport.south
    );
    if (!intersects) continue;
    features.push({
      type: 'Feature',
      properties: { tileId },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [[b.west, b.south], [b.east, b.south], [b.east, b.north], [b.west, b.north], [b.west, b.south]]
        ]
      }
    });
  }
  return { type: 'FeatureCollection', features };
}


/**
 * Move every polygon east by dLng degrees (to draw it in another world copy)
 */
export function shiftFeatures(fc: FeatureCollection, dLng: number): FeatureCollection {
  if (dLng === 0) return fc;
  return {
    type: 'FeatureCollection',
    features: fc.features.map((f) => ({
      ...f,
      geometry: {
        ...f.geometry,
        coordinates: f.geometry.coordinates.map((ring) => ring.map(([lng, lat]) => [lng + dLng, lat])),
      },
    })),
  };
}

/**
 * Like buildCachedGeoJSON, but for a map view that can show longitudes past
 * ±180 (Leaflet shows repeated world copies and does not repeat vectors):
 * tiles are placed in each world copy that is on screen.
 */
export function buildCachedGeoJSONForView(
  cachedIds: Iterable<string>,
  viewport: ViewportBounds
): FeatureCollection {
  const ids = [...cachedIds];
  const features: GeoJSONFeature[] = [];
  const firstCopy = Math.floor((viewport.west + 180) / 360);
  const lastCopy = Math.floor((viewport.east + 180) / 360);
  for (let copy = firstCopy; copy <= lastCopy; copy++) {
    const offset = copy * 360;
    const inCopy = buildCachedGeoJSON(ids, { ...viewport, west: viewport.west - offset, east: viewport.east - offset });
    features.push(...shiftFeatures(inCopy, offset).features);
  }
  return { type: 'FeatureCollection', features };
}
