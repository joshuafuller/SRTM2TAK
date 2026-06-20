/**
 * User settings persistence. The settings object is owned by the app state and
 * referenced widely, so `loadSettings` mutates it in place rather than returning
 * a new object — callers keep their existing reference.
 */

export interface AppSettings {
  showGrid: boolean;
  showLabels: boolean;
  concurrentDownloads: number;
  useCache: boolean;
}

const STORAGE_KEY = 'srtm2tak_settings';

/** Persist the current settings to localStorage (best-effort). */
export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {}
}

/** Hydrate `settings` in place from localStorage, keeping current values as fallbacks. */
export function loadSettings(settings: AppSettings): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    settings.showGrid = Boolean(s.showGrid ?? settings.showGrid);
    settings.showLabels = Boolean(s.showLabels ?? settings.showLabels);
    settings.concurrentDownloads = Number(s.concurrentDownloads ?? settings.concurrentDownloads);
    settings.useCache = Boolean(s.useCache ?? settings.useCache);
  } catch {}
}
