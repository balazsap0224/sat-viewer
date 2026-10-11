# SPEC.md — SatViewer

> Version 0.2 (2026-10-11): the owner's answers to the open decisions are applied (section 14). Nothing is built yet.
> Sister project of "Orbital" (the satellite-network game in `../proj`). It reuses the game's globe and some physics code but is a separate repository.
> Items marked **[OPEN]** are decisions not yet made: ask the owner. Items marked **[PROPOSED]** are suggested defaults: implement them, but keep them easy to change.

---

## 1. Vision

A public website (English, v1) that shows **every real, active satellite around the Earth** on a 3D globe, at the right place for the current moment (or any moment within a few days), and lets visitors find out about them.

A visitor can:

1. See all active satellites moving around the Earth in real time, with day and night on the globe.
2. Search for a satellite by name or catalog number (for example "ISS" or `25544`).
3. Filter by owner country or organisation, orbit class (LEO, MEO, GEO, highly elliptical), launch year, and well-known constellations (Starlink, OneWeb, GPS, Galileo…).
4. Click a satellite and read its **info card**: name, owner and operator, launch date and site, age, orbit (perigee, apogee, inclination, period), manufacturer and mass where known, and how fresh its orbit data is.
5. See the selected satellite's orbit, ground track and coverage footprint.
6. Move time forwards and backwards with a slider and speed control, then jump back to "now".
7. Find out **when a satellite passes over their location** and whether it will be visible to the naked eye.

There is **no game** here: no money, agencies, rockets, missions, logins or multiplayer. The site is read-only.

**v1 shows active satellites only** (CelesTrak group `active`: working payloads). Rocket bodies, debris and dead satellites come later (section 8, "Later").

**Owner goals:**

1. A second polished portfolio project connected to aerospace and computer science, quick to show anyone ("where is the ISS right now?").
2. Learn how real satellite tracking works: TLE/OMM orbital elements, the SGP4 propagator, and the TEME frame.
3. Keep correctness: positions must match independent trackers within a few km.

---

## 2. Guiding principles

1. **Real data only.** Every object on screen comes from a published catalog. No invented satellites.
2. **Orbit math is isolated.** `packages/core` has no dependency on UI, network, file system or browser APIs and runs identically in Node and the browser.
3. **Correctness over speed of typing.** Every function in `packages/core` has tests with reference values that the **owner verifies by hand, once per module**, before they are committed (same rule as the game).
4. **No server at runtime.** A scheduled job downloads and merges the data into static files; the browser does all propagation. The site can be hosted as static files.
5. **Be a polite data user.** Download from CelesTrak and other sources only as often as they update, cache, identify the project in requests, and stop on errors (section 4.3).
6. **Credit the sources** on the site (section 4.4).
7. **Show uncertainty honestly.** The info card shows how old the orbit data is; very old data is marked as stale.

---

## 3. Tech stack

Same stack as the game, minus the server and database.

| Area        | Choice                                                              | Notes                                                                                     |
| ----------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Language    | TypeScript (strict) everywhere                                      |                                                                                           |
| Monorepo    | pnpm workspaces                                                     | Packages in section 5                                                                     |
| Front end   | React + Vite + Three.js (`@react-three/fiber`, `drei`)              | Globe reused from the game                                                                |
| Propagator  | **`satellite.js` 7.x** (MIT)                                        | The standard JavaScript SGP4/SDP4 implementation; reads OMM JSON directly (`json2satrec`) |
| Validation  | `zod`                                                               | Validates the downloaded data and the generated data files                                |
| Data job    | Node script (`packages/data-job`), run by a GitHub Actions schedule | Fetch, validate, merge, write static JSON                                                 |
| Testing     | Vitest (unit), Playwright (a few end-to-end checks)                 |                                                                                           |
| Lint/format | ESLint + Prettier, `tsc --noEmit`                                   | TypeScript pinned to the same version as the game                                         |

**Why `satellite.js` instead of our own code:** SGP4 is about 1,500 lines of carefully tuned legacy math (Spacetrack Report #3, revised by Vallado et al. 2006). Re-implementing it would be a large project with nothing to gain; using the standard library and **checking it against the official verification cases** is the conventional approach. Our own code covers what comes after SGP4 (frames, geodetic coordinates, look angles, passes), which is where the learning is.

**Decided (owner, 2026-10-11): Cloudflare Pages.** The site is static, so it does not depend on the game's hosting (the game needs a Node server and a database). The options that were compared:

| Option                             | Cost      | Commercial use (ads, donations)                                                                                   | Notes                                                                                 |
| ---------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Cloudflare Pages** (recommended) | Free      | Allowed                                                                                                           | Unlimited bandwidth on the free plan; private repo is fine; free cookieless analytics |
| GitHub Pages                       | Free      | Grey area: GitHub's terms say Pages is not for sites "primarily directed at facilitating commercial transactions" | Simplest setup; on the free GitHub plan the repo must be public                       |
| Netlify                            | Free tier | Allowed                                                                                                           | Free tier has usage limits; fine for this size                                        |
| Vercel (Hobby)                     | Free      | **Not allowed** (Hobby plan is non-commercial only)                                                               | Excluded because of the monetization goal                                             |

With Cloudflare Pages, the scheduled GitHub Actions job builds the data and deploys with a Cloudflare API token stored as a GitHub secret.

---

## 4. Data sources

### 4.1 Orbits: CelesTrak GP data (primary)

- URL form: `https://celestrak.org/NORAD/elements/gp.php?GROUP=<group>&FORMAT=JSON`. Group `active` is all active payloads; other groups (for example `stations`, `starlink`, `gps-ops`, debris groups) give subsets.
- **Format: OMM JSON, not TLE.** CelesTrak ran out of 5-digit catalog numbers on 2026-07-11. Objects launched since then have 6-digit numbers (100000+) and **are not available as TLEs at all**. OMM (Orbit Mean-Elements Message) has the same content as a TLE in named fields (`EPOCH`, `MEAN_MOTION`, `ECCENTRICITY`, `INCLINATION`, `RA_OF_ASC_NODE`, `ARG_OF_PERICENTER`, `MEAN_ANOMALY`, `BSTAR`, …) without the width limits.
- CelesTrak checks for new data every **2 hours**. A repeat download of the same data before the next update is answered with **HTTP 403**, and an IP that collects 50 errors (301/403/404) in 2 hours is blocked at the firewall.
- Each object's elements are typically refreshed once or a few times a day.

### 4.2 Metadata

| Source                                                  | Fields we use                                                                                                                   | Licence / terms                                                                                                                                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **CelesTrak SATCAT** (`/satcat/records.php`, JSON/CSV)  | Name, international designator, NORAD number, object type, operational status, owner code, launch date, launch site, decay date | CelesTrak usage policy (owner reads it before the site goes public). It covers download load only; it says nothing about redistribution or commercial use. **[PROPOSED]** email CelesTrak before ads go live |
| **GCAT** (Jonathan McDowell, planet4589.org/space/gcat) | Operator/owner details, manufacturer, bus, mass, dimensions (exact columns confirmed in module 2)                               | **CC-BY 4.0**. Credit: "data from GCAT (J. McDowell, planet4589.org/space/gcat)"                                                                                                                             |
| UCS Satellite Database                                  | Purpose (communications, Earth observation, navigation…), users                                                                 | Updates paused; data stops at May 2023. **[PROPOSED]** not used in v1; GCAT and SATCAT cover most of what we need                                                                                            |
| Wikipedia / Wikidata                                    | Descriptions and photos of famous satellites                                                                                    | **Later** (owner, 2026-10-11), not in v1                                                                                                                                                                     |
| Space-Track.org                                         | (the original US Space Force catalog)                                                                                           | Needs an account, and its user agreement limits redistribution. **Not used.**                                                                                                                                |

Owner codes (`US`, `PRC`, `CIS`, `ESA`, `ITSO`…) are translated to readable names and flags with a table in `content/owners.json`.

### 4.3 Refresh policy

- Orbits every **6 hours** (owner, 2026-10-11); **[PROPOSED]** SATCAT once a day; GCAT once a week. The positions on screen stay correct between refreshes because SGP4 computes them from the elements (section 6.1). The refresh only keeps the elements fresh.
- GitHub disables scheduled workflows in a public repo after 60 days without commits. The About page shows the data age, and the job's failure email tells the owner; re-enable the workflow if that happens.
- Every request sends a `User-Agent` naming the project and a contact address.
- The job keeps the last good files. On any HTTP error it **stops, keeps the old data, and fails the workflow run** (so the owner gets an email). It never retries in a loop.
- Sanity checks before publishing: object count within ±10% of the previous run, every record passes the zod schema, no epoch in the future.

### 4.4 Attribution

An "About the data" page and a footer line credit CelesTrak, GCAT, NASA Blue Marble / Black Marble, and `satellite.js`.

---

## 5. Repository layout

```
/
├─ SPEC.md, CLAUDE.md, docs/ (orbit-notes.md, data-notes.md, decisions.md, roadmap.md)
├─ content/
│  ├─ owners.json            # owner code → name, country, flag
│  ├─ constellations.json    # name patterns/groups → constellation (Starlink, GPS…)
│  └─ launch-sites.json      # CelesTrak site code → name, lat, lon
├─ packages/
│  ├─ core/                  # pure: constants, units, vectors, SGP4 wrapper, frames,
│  │                         # geodetic, orbit classes, derived values, look angles, passes
│  ├─ shared/                # zod schemas for the data files
│  ├─ data-job/              # Node: fetch, validate, merge, write public data files
│  └─ web/                   # Vite + React + Three.js site
└─ .github/workflows/        # CI (typecheck, lint, test) and the scheduled data job
```

Generated data (not committed to git; built by the job and deployed with the site):

- `data/elements.json`: compact OMM fields per object (changes every run).
- `data/catalog.json`: merged metadata per NORAD number (changes rarely).
- `data/meta.json`: when each source was fetched, counts.

---

## 6. Orbit math (packages/core)

### 6.1 How positions are computed

1. **Elements → SGP4.** Each object's OMM record is turned into an SGP4 record (`json2satrec`). For any time `t`, SGP4 returns position (km) and velocity (km/s) in the **TEME** frame (True Equator, Mean Equinox: the frame SGP4 was built in).
2. **Why SGP4 and not our Kepler propagator:** the elements are _mean_ elements fitted for SGP4, which includes Earth's oblateness (J2 to J4), atmospheric drag (`BSTAR`) and, for orbits over 225 minutes (SDP4), the Sun and Moon. Feeding them to a plain two-body propagator gives errors of tens of km within hours. This gets documented with a worked comparison in `docs/orbit-notes.md`.
3. **TEME → Earth-fixed.** Rotate about the z axis by GMST (IAU-1982 formula, as Vallado recommends for SGP4 output). Polar motion is ignored (tens of metres) and UT1 is taken as UTC (under 0.9 s, so under about 0.4 km along the equator). Both are well below SGP4's own error.
4. **Earth-fixed → latitude/longitude/altitude** on the **WGS-84 ellipsoid** (the game used a sphere). For a satellite at 400 km, geodetic and geocentric latitude differ by up to about 0.2° (about 20 km), which is visible on a ground track.
5. **Accuracy to expect:** about 1 km near the element epoch, growing by roughly 1 to 3 km per day for low orbits. **[PROPOSED]** The info card shows the data age; elements older than 14 days are marked "stale"; the time slider is limited to ±7 days around now.
6. SGP4 can report errors (decayed object, eccentricity out of range). Such objects are hidden and listed on the About page, never drawn at a wrong position.

### 6.2 Units and constants

- km, s, rad internally; km and degrees on screen (degrees are converted at the UI boundary).
- SGP4 uses its own **WGS-72** constants internally (that is how the elements are fitted). Everything after SGP4 uses **WGS-84** (`R_EARTH = 6378.137` km, flattening `1/298.257223563`). Documented so the two are never mixed.

### 6.3 Derived values (for the info card and filters)

- Period from mean motion `n` (rev/day): `P = 1440 / n` minutes.
- Semi-major axis from `n` in rad/s: `a = (MU / n²)^(1/3)`; perigee and apogee altitude `a(1 − e) − R`, `a(1 + e) − R`.
- Orbit class **[PROPOSED]**: LEO (apogee < 2,000 km), MEO, GEO (period within 1% of a sidereal day and `i` < 10°), HEO (`e` > 0.25), compared with SATCAT's own values.

### 6.4 Passes over an observer

- Look angles: observer position on WGS-84 → topocentric south-east-zenith (SEZ) frame → azimuth, elevation, range.
- A pass: elevation rises above a threshold **[PROPOSED 10°]**, found by coarse steps (30 s) and refined by bisection.
- **Visible to the naked eye** when the satellite is in sunlight (cylindrical Earth-shadow model) and the observer's Sun elevation is below −6° (civil twilight). Uses `sunDirectionEci` from the game.

### 6.5 Reference tests (owner verifies by hand, once per module)

- **SGP4 verification:** a handful of cases from Vallado's official SGP4 verification set (`SGP4-VER.TLE` and its expected outputs; near-Earth, deep-space and high-eccentricity objects) must match to within 1 m in TEME. This checks that `satellite.js` is used correctly.
- GMST at a few known instants (same check as the game's module 3).
- TEME → ECEF → geodetic for a hand-worked example; a GEO satellite's longitude stays roughly fixed over a day.
- Derived values for the ISS from its current elements (period about 92–93 min, inclination about 51.6°).
- Look angles for a hand-worked observer/satellite pair; a pass found by the search matches an independent tracker (for example Heavens-Above) to within a minute.
- **End check:** the ISS's sub-satellite point at a chosen moment matches an independent tracker to within about 10 km.

---

## 7. Front end

### 7.1 Globe

- Reused from the game: textured Earth (Blue Marble day, Black Marble night, soft terminator), camera rig, focus-on-satellite, theme.
- All objects as instanced points coloured by **[PROPOSED]** orbit class (filter-dependent alternatives: by owner, by type).
- The selected object: orbit line, ground track (one orbit back, one ahead), coverage footprint, label.
- Hover shows name and owner; click opens the info card.

### 7.2 Panels

- **Search** (name, NORAD number, international designator) with instant results.
- **Filters:** owner, orbit class, launch year range, constellation. A counter shows "N of M objects".
- **Info card** (section 1, item 4), with links to the CelesTrak and Wikipedia pages where they exist.
- **Time bar:** now / play / pause, speed (1x to 1,000x **[PROPOSED]**), slider ±7 days.
- **My location:** browser geolocation or typed coordinates; next passes of the selected satellite with visibility.
- **About the data:** sources, licences, when the data was last refreshed, hidden objects.
- The URL encodes the selected satellite and filters, so a link like `…/#sat=25544` can be shared.

### 7.3 Performance

- Target: 60 fps with about 15,000 active satellites on a mid-range laptop **[PROPOSED]**. The design should not rule out about 30,000 objects, for when debris is added later.
- SGP4 runs in a **Web Worker**, a few times per second, writing positions into a `Float32Array` that is transferred to the main thread. Between samples the main thread interpolates. At higher speeds the sample rate goes up so the interpolation error stays under about 1 km.
- `satellite.js` 7 also offers a WebAssembly bulk-propagation API; try it only if measurements show a need.

---

## 8. Phases and modules **[PROPOSED]**

Same working method as the game: one module at a time, the owner checks each one.

### Phase 1: Data and orbits core

| #   | Module                    | What it does                                                                                  | What the owner checks                                                     |
| --- | ------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1   | Repo and globe            | New repo, copied globe and physics pieces (section 11), globe at the real current time        | Visual: day/night correct for now                                         |
| 2   | Data job                  | Fetch CelesTrak GP + SATCAT + GCAT, validate, merge, owner table, polite caching; run locally | Counts, a few records (ISS, a GPS satellite, a Starlink) look right       |
| 3   | SGP4 and frames           | `satellite.js` wrapper, TEME → ECEF → WGS-84 geodetic, derived values, orbit classes          | Reference values (6.5)                                                    |
| 4   | All satellites on a globe | Worker propagation, instanced points, time bar                                                | **Milestone:** all active satellites move; the ISS matches a tracker; fps |

### Phase 2: Exploring

| #   | Module                     | What it does                                                                      | What the owner checks              |
| --- | -------------------------- | --------------------------------------------------------------------------------- | ---------------------------------- |
| 5   | Search, filters, info card | Panels from 7.2 except passes; orbit line, ground track, footprint; shareable URL | Visual + info card content         |
| 6   | Passes                     | Look angles, pass search, visibility                                              | Reference values; vs Heavens-Above |

### Phase 3: Publish

| #   | Module               | What it does                                                                     | What the owner checks         |
| --- | -------------------- | -------------------------------------------------------------------------------- | ----------------------------- |
| 7   | Schedule and hosting | GitHub Actions schedule, deploy, About page, attribution, a few Playwright tests | The live site; data refreshes |

### Later (only if wanted)

Rocket bodies, debris and dead satellites (with a type filter); Hungarian translation; statistics pages (satellites by country, by year, launches per year); decayed and historical objects; Wikipedia photos; close-approach data (CelesTrak SOCRATES); 3D models for a few famous satellites; mobile layout; a "real satellites" layer inside the game.

---

## 9. Testing

- `packages/core`: unit tests with owner-verified reference values (6.5), property tests (round trips between frames).
- `packages/data-job`: tests with saved sample responses (never live network in tests); schema failures and HTTP errors stop the job.
- End to end: the site loads, the ISS can be searched and selected, the info card shows its launch date.

---

## 10. Non-functional requirements

- First load under about 3 MB of data compressed **[PROPOSED]** (compact element format, gzip/brotli by the host).
- The data sources need no accounts. The only secret is the hosting deploy token, kept in GitHub's secret store, never in the repo.
- No tracking cookies, so no cookie banner is needed (analytics, if any, must be cookieless).
- Works in current Firefox, Chrome and Edge; desktop first.
- Readable code with comments that explain the orbital mechanics.

---

## 11. Reused from the game (`../proj`)

Copied (not linked) at the start, then owned by this repo:

- `packages/physics/src`: `constants.ts`, `units.ts`, `vector.ts`, `sun.ts`, `footprint.ts`, and the GMST/geodetic parts of `frames.ts` (adapted from world time to real UTC; geodetic upgraded to WGS-84).
- `packages/web/src/scene`: `Earth.tsx`, `earthMaterial.ts`, `earthTiles.ts`, `Sun.tsx`, `CameraRig.tsx`, `coords.ts`, `framing.ts`, `focusTargets.ts`; `packages/web/public/textures`.
- `packages/web/src/ui`: `theme.css`, `styles.ts`, parts of `TimePanel.tsx` and `SelectedPanel.tsx`.
- Config: ESLint, Prettier, tsconfig, Vitest and Playwright setup.

---

## 12. Monetization **[PROPOSED]**

The owner wants some income if possible (2026-10-11) and left the method to Claude. Plan, in steps:

1. **v1: donations.** A "Support this site" link (Ko-fi or GitHub Sponsors) in the footer and on the About page. No cookies, no consent banner, no effect on the data terms.
2. **v1: cookieless analytics** (Cloudflare Web Analytics, free) to see how many visitors come. Ads earn very little below a few thousand visitors a month, so this decides step 3.
3. **Later, if traffic justifies it: one unobtrusive ad slot.** Prefer a privacy-friendly network (for example EthicalAds or Carbon Ads) over Google AdSense, which in the EU needs a certified consent banner. Before ads go live: email CelesTrak about commercial use (section 4.2) and confirm the hosting allows it (section 3).

All data sources used allow this: GCAT is CC-BY 4.0 (commercial use allowed with credit), NASA textures are public domain, `satellite.js` is MIT.

---

## 13. Out of scope

Logins, user accounts, comments; anything from the game (money, rockets, missions); predicting manoeuvres; anything needing Space-Track; native apps.

---

## 14. Working agreements for Claude Code (copy into CLAUDE.md)

Same as the game's SPEC section 16, with these changes: `packages/core` (not physics/game) stays free of I/O; content is `owners.json`, `constellations.json`, `launch-sites.json`; never hammer data sources (4.3); live network calls are never part of tests.

---

## 15. Open decisions

Nothing is open at the moment.

Decided by the owner on 2026-10-11:

- Hosting: **Cloudflare Pages** (section 3).
- Name: **SatViewer** (folder `sat-viewer`).
- v1 shows active satellites only; debris later.
- Orbit data refresh every 6 hours.
- Wikipedia descriptions and photos: later.
- Site language: English in v1.
- The owner reads the CelesTrak usage policy before the site goes public.
- Monetization: left to Claude, "some if possible": see section 12.
