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

**Earth textures (changed 2026-10-12, owner left the choice to Claude):** the globe now starts with
2048-px versions (1.35 MB for all four) and downloads the 5400-px ones (8.2 MB) only when the
camera comes close enough for the difference to show (`textureDetail.ts`: about 3 Earth radii
from the centre on a 1080-px-tall screen, 5 on a high-density one). First load is now about
3.1 MB in all (data + code 1.73 MB, textures 1.35 MB).
Bug found by the owner the same evening and fixed: once zoomed in, the sharp textures were sent
to the GPU before being marked sRGB, so the Earth looked washed out and the night side lavender.
They are now marked during render, before drei uploads them (`Earth.tsx`, `SharpTextures`).

**Actions minutes:** a deploy run takes about 5 min (owner, 2026-10-12): 4 a day is about
600 of the private repo's 2,000 free minutes a month, plus pushes and CI.

### Owner checks after the first deploy

| Check                                                                                          | ✓              |
| ---------------------------------------------------------------------------------------------- | -------------- |
| The first "Data and deploy" run is green and the site opens at https://satviewer-8hx.pages.dev | ✓ (2026-10-12) |
| The ISS on the live site matches a tracker (e.g. wheretheiss.at)                               | ✓ (2026-10-12) |
| About page: fetch times are from that run                                                      | ✓ (2026-10-12) |
| After the 00:17 UTC run on 13 October, the About page's orbit fetch time has moved on (\*)     |                |
| Web Analytics enabled in Cloudflare                                                            | ✓ (2026-10-12) |
| The CelesTrak usage policy has been read (SPEC.md 15)                                          | ✓ (2026-10-12) |

(\*) The first run (a push, 15:24 UTC) was off the 6-hour beat. Orbit data is fetched again only once
the cached copy is 5.5 hours old (`sources.ts`), so the 18:17 run kept the 15:24 data; that is
correct. From 00:17 on, every scheduled run fetches fresh orbits.
