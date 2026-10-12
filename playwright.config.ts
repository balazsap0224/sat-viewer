// End-to-end tests (SPEC.md 9, module 7): a real browser opens the built site. `pnpm e2e`
// builds the site and serves it with `vite preview` on its own port, so a running `pnpm web`
// is not disturbed. The data files come from e2e/fixtures/data (16 objects), never from the
// live sources: the tests intercept /data/*.json (e2e/helpers.ts).
//
// Locally the tests use the Microsoft Edge already installed on Windows (no download); in CI
// they use Playwright's Chromium (`pnpm exec playwright install --with-deps chromium`).

import { defineConfig } from '@playwright/test';

const PORT = 4197;
const ci = !!process.env.CI;

export default defineConfig({
  testDir: 'e2e',
  // CI's machine has no graphics card: the globe is drawn in software, which is slow.
  timeout: ci ? 120_000 : 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: ci ? 1 : 0,
  reporter: ci ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    ...(ci ? {} : { channel: 'msedge' }),
    viewport: { width: 1400, height: 850 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `pnpm --filter @sat-viewer/web build && pnpm --filter @sat-viewer/web preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
