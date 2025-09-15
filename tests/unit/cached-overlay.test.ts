import { describe, it, expect } from 'vitest';
import { buildCachedGeoJSON } from '@/lib/cached-overlay';

describe('buildCachedGeoJSON', () => {
  const viewport = { north: 40, south: 35, west: -113, east: -108 };

  it('returns empty feature collection for empty cache', () => {
    const fc = buildCachedGeoJSON([], viewport);
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features.length).toBe(0);
  });

  it('includes only tiles intersecting the viewport', () => {
    const cached = new Set(['N35W113', 'N36W112', 'N10E010']); // last one outside
    const fc = buildCachedGeoJSON(cached, viewport);
    const ids = fc.features.map((f: any) => f.properties.tileId);
    expect(ids).toContain('N35W113');
    expect(ids).toContain('N36W112');
    expect(ids).not.toContain('N10E010');
  });
});

