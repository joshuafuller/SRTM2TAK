import { expect, openApp, selectArea, test } from './setup';

test('asks before a very large download and stops if the user cancels', async ({ page }) => {
  const dialogs: string[] = [];
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });

  await openApp(page);
  // 15 x 15 = 225 tiles, above the desktop limit of 200
  await selectArea(page, { south: 30.5, north: 44.5, west: -115.5, east: -101.5 });
  await page.click('#download-button');

  await expect.poll(() => dialogs.length).toBe(1);
  expect(dialogs[0]).toContain('225 tiles');
  await expect(page.locator('#progress-overlay')).not.toBeVisible();
});
