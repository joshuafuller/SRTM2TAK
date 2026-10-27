import { expect, openApp, test } from './setup';

test.describe('map startup', () => {
  test('starts the map with no failed app requests or console errors', async ({ page }) => {
    const failures: string[] = [];

    page.on('console', (message) => {
      if (message.type() === 'error') failures.push(`console: ${message.text()}`);
    });
    page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
    // Only same-origin requests: the app's own files, such as the MapLibre worker
    page.on('response', (response) => {
      if (response.url().startsWith('http://127.0.0.1:5173/') && response.status() >= 400) {
        failures.push(`HTTP ${response.status()}: ${response.url()}`);
      }
    });

    await openApp(page);
    await page.waitForFunction(() => (window as any).appState?.map?.loaded());

    expect(failures).toEqual([]);
  });

  test('explains why the map cannot start when WebGL2 is missing', async ({ page }) => {
    await page.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
        if (type === 'webgl2') return null;
        return (getContext as any).call(this, type, ...args);
      } as typeof getContext;
    });

    await page.goto('/');

    await expect(page.locator('#map .map-error')).toContainText('WebGL 2');
    await expect(page.locator('#map canvas')).toHaveCount(0);
  });
});
