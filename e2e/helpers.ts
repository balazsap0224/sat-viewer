// Shared steps of the end-to-end tests (module 7).
//
// The site loads /data/*.json; here every such request is answered from e2e/fixtures/data, a
// 16-object extract of a real data job run (ISS, Tiangong, GPS, Starlink, Astra, Fengyun-1C
// debris). The browser's clock is set to an hour after that run, so the elements are as fresh
// as on the live site and SGP4 propagates them the same way however old the fixture gets.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

const FIXTURES = join(import.meta.dirname, 'fixtures', 'data');

const meta = JSON.parse(readFileSync(join(FIXTURES, 'meta.json'), 'utf8')) as {
  generatedAt: string;
};

/** The fixture's download time plus one hour [Unix ms] */
export const FIXTURE_NOW = Date.parse(meta.generatedAt) + 3_600_000;

/** Serves the fixture data, sets the clock, and opens the site at `hash` (e.g. "#sat=25544"). */
export async function openSite(page: Page, hash = ''): Promise<void> {
  await page.route('**/data/*.json', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop() ?? '';
    await route.fulfill({
      contentType: 'application/json',
      body: readFileSync(join(FIXTURES, name), 'utf8'),
    });
  });
  // Time keeps flowing from FIXTURE_NOW, so the satellites still move.
  await page.clock.install({ time: FIXTURE_NOW });
  await page.clock.resume();
  await page.goto(`/${hash}`);
}
