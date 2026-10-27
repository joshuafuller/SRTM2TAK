import { describe, it, expect, beforeEach } from 'vitest';
import { loadSettings, type AppSettings } from '@/app/settings';

function defaults(): AppSettings {
  return { showGrid: true, showLabels: true, concurrentDownloads: 3, useCache: true };
}

describe('loadSettings concurrentDownloads', () => {
  beforeEach(() => localStorage.clear());

  it.each([
    ['"abc"', 3],
    ['null', 3],
    ['0', 1],
    ['50', 10],
    ['4', 4],
  ])('stored %s gives %d', (stored, expected) => {
    const key = 'srtm2tak_settings';
    localStorage.setItem(key, `{"concurrentDownloads": ${stored}}`);
    const settings = defaults();
    loadSettings(settings);
    expect(settings.concurrentDownloads).toBe(expected);
  });
});
