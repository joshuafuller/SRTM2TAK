import { expect, openApp, test } from './setup';

test.describe('map startup', () => {
  test('starts the map with no failed app requests or console errors', async ({ page }) => {
    const failures: string[] = [];

    page.on('console', (message) => {
      if (message.type() === 'error') failures.push(`console: ${message.text()}`);
    });
    page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
    // Only same-origin requests: the app's own files
    page.on('response', (response) => {
      if (response.url().startsWith('http://127.0.0.1:5173/') && response.status() >= 400) {
        failures.push(`HTTP ${response.status()}: ${response.url()}`);
      }
    });

    await openApp(page);
    await expect(page.locator('#map .leaflet-tile-pane')).toBeAttached();

    expect(failures).toEqual([]);
  });

  test('works in a browser without WebGL', async ({ page }) => {
    // Firefox with hardware acceleration off has no WebGL 2; some setups have no WebGL at all
    await page.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
        if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
        return (getContext as any).call(this, type, ...args);
      } as typeof getContext;
    });

    await openApp(page);
    await expect(page.locator('#map .leaflet-tile-pane')).toBeAttached();
    await expect(page.locator('#map .map-error')).toHaveCount(0);
  });
});
