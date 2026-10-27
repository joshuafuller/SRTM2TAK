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
