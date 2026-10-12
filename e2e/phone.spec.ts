// The phone layout (module 8): a phone-sized touch screen, held upright and sideways.

import { expect, type Page, test } from '@playwright/test';
import { openSite } from './helpers';

/** Every part of the element lies inside the window (nothing cut off at an edge). */
async function expectOnScreen(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  const size = page.viewportSize()!;
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(size.width + 0.5);
  expect(box!.y + box!.height).toBeLessThanOrEqual(size.height + 0.5);
}

test.describe('upright phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('search, info card in the sheet, Follow folds it, tabs switch', async ({ page }) => {
    await openSite(page);
    const tabs = page.getByRole('navigation', { name: 'Panels' });
    await expect(tabs).toBeVisible();
    await expectOnScreen(page, '.timebar');
    await expectOnScreen(page, '.phone-tabs');

    await page.getByRole('combobox', { name: /Search satellites/ }).fill('iss');
    await page.getByRole('option').first().tap();
    const card = page.getByRole('region', { name: 'About ISS (ZARYA)' });
    await expect(card).toContainText('20 November 1998');

    await card.getByRole('button', { name: 'Follow' }).tap();
    await expect(page.locator('.info-folded')).toContainText('km/s');

    await tabs.getByRole('button', { name: 'Filters' }).tap();
    await expect(page.getByRole('region', { name: 'Filters' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Legend and data status' })).toContainText('13');
    await tabs.getByRole('button', { name: 'Filters' }).tap();
    await expect(page.getByRole('region', { name: 'Filters' })).toHaveCount(0);
  });

  test('About opens from the ⓘ button', async ({ page }) => {
    await openSite(page);
    await page.getByRole('button', { name: 'About SatViewer' }).tap();
    await expect(page.getByRole('dialog', { name: 'About the data' })).toContainText('GCAT');
  });
});

test.describe('sideways phone', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test('panels stand on the left, the time bar fits on screen', async ({ page }) => {
    await openSite(page, '#sat=25544');
    await expect(page.getByRole('region', { name: 'About ISS (ZARYA)' })).toBeVisible();
    await expectOnScreen(page, '.timebar');
    await expectOnScreen(page, '.phone-tabs');
    const column = await page.locator('.phone').boundingBox();
    expect(column!.width).toBeLessThan(400);
  });
});
