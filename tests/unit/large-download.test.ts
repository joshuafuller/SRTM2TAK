import { describe, it, expect } from 'vitest';
import { largeDownloadLimit } from '@/lib/tile-utils';

describe('largeDownloadLimit', () => {
  it('is lower on phones and tablets', () => {
    expect(largeDownloadLimit({ coarsePointer: true })).toBe(30);
  });

  it('is lower on devices with little memory', () => {
    expect(largeDownloadLimit({ coarsePointer: false, deviceMemoryGb: 2 })).toBe(30);
  });

  it('is higher on desktops', () => {
    expect(largeDownloadLimit({ coarsePointer: false, deviceMemoryGb: 16 })).toBe(200);
    expect(largeDownloadLimit({ coarsePointer: false })).toBe(200);
  });
});
