import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// A fake navigator.serviceWorker: an event target with a controller
function fakeServiceWorker(controller: object | null) {
  const target = new EventTarget();
  return Object.assign(target, {
    controller,
    register: vi.fn().mockResolvedValue({
      scope: '/SRTM2TAK/',
      update: vi.fn(),
      addEventListener: vi.fn(),
    }),
  });
}

describe('registerServiceWorker reloads once when a new version takes over', () => {
  const realSw = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
  const reload = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    reload.mockReset();
    vi.stubGlobal('location', { ...window.location, reload });
    // registerServiceWorker() runs only in production builds
    vi.stubEnv('DEV', false);
    vi.stubEnv('MODE', 'production');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    if (realSw) Object.defineProperty(navigator, 'serviceWorker', realSw);
  });

  async function setup(controller: object | null) {
    const sw = fakeServiceWorker(controller);
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: sw });
    const { registerServiceWorker } = await import('@/app/pwa');
    await registerServiceWorker();
    return sw;
  }

  it('reloads when a new service worker replaces the old one', async () => {
    const sw = await setup({});
    sw.dispatchEvent(new Event('controllerchange'));
    sw.dispatchEvent(new Event('controllerchange'));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload on the first install (no older version)', async () => {
    const sw = await setup(null);
    sw.dispatchEvent(new Event('controllerchange'));
    expect(reload).not.toHaveBeenCalled();
  });
});
