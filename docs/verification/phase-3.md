# Phase 3: what the owner checks

## Module 7: schedule and hosting

No orbit-math reference values in this module. The owner checks the live site and that the
data refreshes. Setup steps: `docs/hosting.md`.

### Built

- `.github/workflows/deploy.yml`: every 6 hours (00:17, 06:17, 12:17, 18:17 UTC), on every push
  to `main`, and by hand. Tests → data job → save cache → build → upload to Cloudflare Pages.
  Download cache and last good data carry over between runs; runs never overlap; any error
  stops the run before the deploy (the live site keeps its old data, GitHub emails the owner).
- `.github/workflows/ci.yml`: adds the end-to-end tests.
- `e2e/site.spec.ts` (`pnpm e2e`): the site loads (13 objects), "iss" → ISS (ZARYA) → info
  card shows 20 November 1998 and Baikonur, `#sat=48274` opens Tiangong, the About page
  credits CelesTrak, GCAT (McDowell), satellite.js and NASA Blue Marble. Fixture data, never
  live sources. 4 of 4 pass in Edge (2026-10-12).
- `packages/web/public/_headers`: long cache for hashed JS/CSS, revalidation for everything else.

### Measured (2026-10-12, local build)

| What                    | Raw     | gzip                                                       |
| ----------------------- | ------- | ---------------------------------------------------------- |
| elements.json           | 2.32 MB | 0.83 MB                                                    |
| catalog.json            | 6.71 MB | 0.38 MB                                                    |
| encounters.json         | 0.34 MB | 0.13 MB                                                    |
| JavaScript              | 1.38 MB | 0.39 MB                                                    |
| **Data + code**         |         | **1.73 MB** (target "about 3 MB of data", SPEC.md 10: met) |
| Earth textures (4 JPEG) | 8.2 MB  | 8.2 MB (JPEG does not compress further)                    |

Closest-meetings screening: 3 min on the owner's desktop; the workflow allows 45 min in all.

**Known limit:** the Earth textures are most of the first load (about 10 MB in all). Smaller
textures, or loading the night side later, would cut it; owner's choice, not done.

### Owner checks after the first deploy

| Check                                                                                      | ✓   |
| ------------------------------------------------------------------------------------------ | --- |
| The first "Data and deploy" run is green and the site opens at https://satviewer.pages.dev |     |
| The ISS on the live site matches a tracker (e.g. wheretheiss.at)                           |     |
| About page: fetch times are from that run                                                  |     |
| After the next scheduled run (≤ 6 h), the About page's orbit fetch time has moved on       |     |
| Web Analytics enabled in Cloudflare                                                        |     |
| The CelesTrak usage policy has been read (SPEC.md 15)                                      |     |
