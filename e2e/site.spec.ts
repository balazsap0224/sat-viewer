// The checks SPEC.md 9 asks for: the site loads, the ISS can be searched and selected, and its
// info card shows the launch date. Plus the shared link and the About page's credits.

import { expect, test } from '@playwright/test';
import { openSite } from './helpers';

test('the site loads and counts the objects', async ({ page }) => {
  await openSite(page);
  const legend = page.getByRole('region', { name: 'Legend and data status' });
  await expect(legend).toContainText('13');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('search "iss", select it, the info card shows its launch', async ({ page }) => {
  await openSite(page);
  const search = page.getByRole('combobox', { name: /Search satellites/ });
  await search.fill('iss');
  await expect(page.getByRole('option').first()).toContainText('ISS (ZARYA)');
  await search.press('Enter');

  const card = page.getByRole('region', { name: 'About ISS (ZARYA)' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('20 November 1998');
  await expect(card).toContainText('Baikonur');
  await expect(page).toHaveURL(/#sat=25544$/);
});

test('a shared link opens the satellite', async ({ page }) => {
  await openSite(page, '#sat=48274');
  await expect(page.getByRole('region', { name: 'About CSS (TIANHE)' })).toBeVisible();
});

test('the About page credits the sources', async ({ page }) => {
  await openSite(page);
  await page.getByRole('button', { name: 'About' }).click();
  const about = page.getByRole('dialog', { name: 'About the data' });
  await expect(about).toBeVisible();
  for (const credit of ['CelesTrak', 'GCAT', 'McDowell', 'satellite.js', 'Blue Marble']) {
    await expect(about).toContainText(credit);
  }
});
