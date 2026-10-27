import { describe, it, expect } from 'vitest';
import { latLonToTileId } from '@/lib/tile-utils';

describe('latLonToTileId longitude wrapping', () => {
  it('wraps map longitudes outside ±180 (repeated world copies)', () => {
    expect(latLonToTileId(38.5, -105.5 + 360)).toBe('N38W106');
    expect(latLonToTileId(0.5, 180.5)).toBe('N00W180');
    expect(latLonToTileId(0.5, -180.5)).toBe('N00E179');
  });

  it('keeps normal longitudes unchanged', () => {
    expect(latLonToTileId(36.2, -111.8)).toBe('N36W112');
    expect(latLonToTileId(0.5, 179.5)).toBe('N00E179');
    expect(latLonToTileId(0.5, -180)).toBe('N00W180');
  });
});
