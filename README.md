# SatViewer

Every real, active satellite around the Earth on a 3D globe, at the right place for the current
moment.

**Live site: https://satviewer-8hx.pages.dev**

## What it does

- Shows all active satellites (CelesTrak group `active`) plus three well-known debris clouds,
  moving in real time over a globe with day and night.
- Search by name or catalog number (for example `ISS` or `25544`).
- Filter by owner, orbit class (LEO, MEO, GEO, highly elliptical), launch year and constellation
  (Starlink, OneWeb, GPS, Galileo…).
- Info card for each satellite: owner and operator, launch date and site, orbit (perigee, apogee,
  inclination, period), manufacturer and mass where known, and how old its orbit data is.
- Orbit, ground track and coverage footprint of the selected satellite.
- Time slider and speed control to move a few days forwards or backwards.
- Passes over your location, with naked-eye visibility.
- Closest meetings between satellites, and a watchlist.
- Works on phones.

There is no server at runtime: a scheduled job downloads and merges the data into static files,
and the browser computes every position with SGP4.

## How it works

1. **Data job** (`packages/data-job`): every 6 hours, a GitHub Actions schedule fetches orbital
   elements (OMM JSON) from CelesTrak and metadata from CelesTrak SATCAT and GCAT, validates them
   with zod, merges them and writes static JSON files. It makes at most one request per source per
   run, caches, and stops on any HTTP error.
2. **Orbit math** (`packages/core`): SGP4 via [`satellite.js`](https://github.com/shashwatak/satellite-js),
   then TEME → ECEF → WGS-84 geodetic coordinates, orbit classes, look angles and passes. Pure
   TypeScript with no I/O, DOM or network, tested against reference values.
3. **Site** (`packages/web`): React, Vite and Three.js. A web worker propagates all satellites
   and the globe draws them as instanced points.
4. **Hosting**: Cloudflare Pages, deployed by the same workflow.

## Repository layout

```
packages/
  core/       orbit math (pure, no I/O)
  shared/     zod schemas for the data files
  data-job/   fetch, validate, merge, write the public data files
  web/        the site
content/      owner codes, constellations, launch sites… (zod-validated JSON)
docs/         orbit notes, data notes, decisions, roadmap, verification
e2e/          Playwright end-to-end tests
SPEC.md       the full specification
```

## Running it locally

Needs Node 24 and pnpm 10.

```sh
pnpm install
pnpm data     # fetch the data (politely, cached in .data-cache/) into packages/web/public/data/
pnpm web      # start the site (Vite dev server)
```

Checks:

```sh
pnpm test        # unit tests (Vitest)
pnpm typecheck   # tsc --noEmit in every package
pnpm lint        # ESLint
pnpm e2e         # end-to-end tests (Playwright)
```

Tests never call the live data sources.

## Status

Built module by module; see [`docs/roadmap.md`](docs/roadmap.md). Statistics pages are in
progress.

## Data and credits

- Orbits and catalog: [CelesTrak](https://celestrak.org) (GP data and SATCAT).
- Satellite details: data from GCAT (J. McDowell,
  [planet4589.org/space/gcat](https://planet4589.org/space/gcat)), CC-BY 4.0.
- Earth textures: NASA Blue Marble and Black Marble.
- SGP4 propagator: [`satellite.js`](https://github.com/shashwatak/satellite-js) (MIT).
