import { describe, it, expect } from 'vitest';
import { computeServiceWorkerUrl } from '@/lib/sw';

describe('Service worker registration URL', () => {
  it('constructs URL under base path', () => {
    expect(computeServiceWorkerUrl('/')).toBe('/sw.js');
    expect(computeServiceWorkerUrl('/SRTM2TAK/')).toBe('/SRTM2TAK/sw.js');
    expect(computeServiceWorkerUrl('/my/app/')).toBe('/my/app/sw.js');
  });
});
