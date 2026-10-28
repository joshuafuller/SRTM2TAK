/**
 * Leaflet zoom levels. Leaflet uses 256 px tiles, so Leaflet zoom N+1 has the
 * scale of MapLibre zoom N (512 px tiles). These keep the old MapLibre view.
 */
export const MAP_ZOOM = {
  start: 5,
  min: 3,
  max: 11,
  /** Grid shows from this zoom (one 1° tile is about 45 px wide here) */
  grid: 6,
  /** Tile ID labels show from this zoom */
  labels: 8,
} as const;

/** Map scale at a Leaflet zoom: degrees of longitude per screen pixel */
export function degreesPerPixel(zoom: number): number {
  return 360 / (256 * 2 ** zoom);
}
