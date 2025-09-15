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

