import { expect, openApp, test } from './setup';

test.describe('audit fixes', () => {
  test('Clear Cache keeps the app-shell precache and removes the tile cache', async ({ page }) => {
    await openApp(page);
    await page.evaluate(async () => {
      await caches.open('workbox-precache-v2-test');
      await caches.open('srtm-tiles');
    });

    await page.click('#menu-toggle');
    await page.click('#clear-cache');
    await expect(page.locator('#notifications .notification.success')).toContainText('Cache cleared');

    const keys = await page.evaluate(() => caches.keys());
    expect(keys).toContain('workbox-precache-v2-test');
    expect(keys).not.toContain('srtm-tiles');
  });

  test('the info button shows and hides the selection panel', async ({ page }) => {
    await openApp(page);
    const panel = page.locator('#info-panel');
    const startHidden = await panel.evaluate((el) => el.classList.contains('hidden'));

    await page.click('#toggle-info');
    await expect(panel).toHaveClass(startHidden ? /^(?!.*\bhidden\b)/ : /\bhidden\b/);

    await page.click('#toggle-info');
    await expect(panel).toHaveClass(startHidden ? /\bhidden\b/ : /^(?!.*\bhidden\b)/);
  });
});

test('the grid stays hidden after Clear Selection when "Show grid" is off', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => { (window as any).appState.map.setView([38.5, -105.5], 6, { animate: false }); });
  const gridShown = () => page.evaluate(() => {
    const s = (window as any).appState;
    return s.map.hasLayer(s.gridLayer) || s.map.hasLayer(s.labelLayer);
  });
  await expect.poll(gridShown).toBe(true);

  await page.click('#menu-toggle');
  await page.uncheck('#show-grid');
  await expect.poll(gridShown).toBe(false);
  await page.keyboard.press('Escape');

  await page.evaluate(() => (document.getElementById('clear-selection') as HTMLButtonElement).click());
  await page.waitForTimeout(300);
  expect(await gridShown()).toBe(false);
});
