# Phase 2: values for the owner to verify

Phase 2 was built in one go (owner's choice, docs/decisions.md, 2026-10-11). Every value below is **PENDING OWNER VERIFICATION**: the tests pass, but a passing test only shows the code agrees with the number written in the test. Please check each number by hand (or against the cited source) and tick it. Test ids such as `[5.1]` appear in the test names.

## Module 5: search, filters, info card (`packages/core/test/module5.test.ts`)

### Reference values

R = 6378.137 km (WGS-84 equatorial radius; the footprint uses a sphere of this radius).

| Id  | Value                                                                                     | Formula / working                                                                                                                                                                                                                                          | Source                                      | ✓   |
| --- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | --- |
| 5.1 | ISS at 420 km, horizon footprint: λ = 20.2455°, edge 2,254 km from the sub-point          | λ = acos(R / (R + h)) = acos(6378.137 / 6798.137) = acos(0.938218) = 20.2455°; arc = λ[rad] · R = 0.353350 · 6378.137 = 2,253.7 km                                                                                                                         | Wertz & Larson, SMAD 3rd ed., §5.2          |     |
| 5.2 | GEO (35,786 km): λ = 81.30° at the horizon; 71.43° at 10° elevation                       | acos(6378.137 / 42164.137) = acos(0.151269) = 81.2995°. With ε = 10°: acos(0.151269 · cos 10°) − 10° = acos(0.148971) − 10° = 81.4327° − 10° = 71.4327°                                                                                                    | same                                        |     |
| 5.3 | Circle of radius 20° around the North Pole: every point at latitude 70°                   | Destination-point formula with φ₁ = 90°: sin φ₂ = cos δ → φ₂ = 90° − δ                                                                                                                                                                                     | spherical trigonometry                      |     |
| 5.4 | ISS orbit line over one period: altitude between 405 and 435 km; ends < 60 km apart       | Perigee 416 / apogee 425 km (module 3, 3.11). After one period the node has moved 4.95°/day · 92.97 min = 0.32°, about 38 km at r = 6,798 km                                                                                                               | `docs/orbit-notes.md`                       |     |
| 5.5 | ISS ground track reaches geodetic latitude ±51.79° (the inclination 51.63° is geocentric) | At the northmost point the geocentric latitude ψ ≈ i = 51.63°. tan φ = tan ψ · (N + h) / (N(1 − e²) + h), N = 6390.5 km at that latitude, h = 420 km: 1.26343 · 6810.5 / 6768.7 = 1.27123 → φ = 51.81° (SGP4 measures 51.79°; the test allows 51.70–51.85) | WGS-84; module 3, 3.7                       |     |
| 5.6 | Successive ascending nodes of the ISS are 23.61° apart, westward                          | Earth turns 360.9856°/day relative to the stars; the orbit's node moves Ω̇ = −1.5 n J2 (R/p)² cos i = −4.947°/day. Per orbit: (360.9856 + 4.947) · 92.974 / 1440 = 23.63°. SGP4 gives 23.61° (the node period differs slightly from 1440/n)                 | Vallado 4th ed. Eq. 9-41 (secular J2 rates) |     |

Also tested without hand values: every point of a footprint circle is the requested angle from its centre (property test, any centre and radius); the track span is one period, capped at 2 days.

### Search, filters, link (`packages/web/src/state/state.test.ts`, `packages/web/src/scene/pick.test.ts`)

Logic tests, nothing to verify by hand: ISS found by "iss", "zarya", "25544", "1998-067A"; filters combine with AND; a satellite with no launch date fails a year filter; the link `#sat=25544&owner=PRC&class=LEO,GEO&from=2015&to=2020&group=starlink` round-trips; the pick takes the visible point, not the one behind the Earth.

### What Claude checked in a real browser (Edge, 1400 × 850, 2026-10-11 ≈ 15:56 UTC)

| Check                                      | Result                                                                                                                                                                          | ✓   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| Search "iss" → Enter                       | ISS (ZARYA) first (then UNITY, NAUKA, ZVEZDA, DESTINY: ISS modules in the catalog); URL becomes `#sat=25544`                                                                    |     |
| ISS info card                              | Owner International Space Station, operator NASA JSC, launched 20 November 1998 from Baikonur, 20,281 kg with the Zarya note, 416 × 425 km, 51.63°, 93.0 min, 421 km, 7.66 km/s |     |
| Orbit line, ground track, footprint, label | Drawn; the ring sits on the ground track; the footprint circle is centred on it                                                                                                 |     |
| Follow / Stop following                    | Camera flies to the ISS and follows it; flies back to the earlier view                                                                                                          |     |
| Filter GEO                                 | "528 of 16,701 objects", URL `#sat=25544&class=GEO`                                                                                                                             |     |
| Hover and click                            | Tooltip "ONEWEB-0019 · United Kingdom"; click selects it (`#sat=45449`); dragging the globe does not change the selection                                                       |     |
| Opening `#sat=48274&class=LEO&owner=PRC`   | Tiangong's card opens, "1,397 of 16,701 objects"                                                                                                                                |     |
| About dialog                               | Sources, licences, fetch times, counts, hidden objects                                                                                                                          |     |
| fps                                        | 60 with a satellite selected                                                                                                                                                    |     |

**Please check by hand:** open a few cards (a Starlink, a GPS satellite, a GEO TV satellite) and see that owner, launch and orbit look right; compare the ISS ground track with Heavens-Above's or wheretheiss.at's map; try a shared link in a new tab.

Known limits:

- Windows does not draw flag emoji, so owners are shown by name only.
- Clicking empty space does not deselect (the × on the card does); a click would too often land between points while aiming.
- The Wikipedia link is a search, so for generic names (e.g. "STARLINK-1007") it lands on a results page.

## Module 6: passes (`packages/core/test/module6.test.ts`)

### Reference values

| Id  | Value                                                                                                                                                                             | Formula / working                                                                                                                                                                                                                                                                                                                              | Source                                 | ✓   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | --- |
| 6.1 | Observer at 0° N 0° E (sea level), satellite 1,000 km up, 10° of arc east along the equator: elevation 34.7231°, azimuth 90°, range 1,558.80 km                                   | r = 6378.137 + 1000 = 7378.137 km. Satellite ECEF = r(cos 10°, sin 10°, 0) = (7266.047, 1281.200, 0); observer = (6378.137, 0, 0); ρ = (887.910, 1281.200, 0). At φ = λ = 0: S = −ρz = 0, E = ρy = 1281.200, Z = ρx = 887.910. El = atan(887.910 / 1281.200) = 34.7231°; Az = atan2(E, −S) = 90°; range = √(887.910² + 1281.200²) = 1558.80 km | Vallado 4th ed., Alg. 27 (RAZEL)       |     |
| 6.2 | The same 10° to the north, west, south: azimuth 0°, 270°, 180°                                                                                                                    | Only ρz or ρy changes sign; −S = ρz for north                                                                                                                                                                                                                                                                                                  | same                                   |     |
| 6.3 | 500 km straight up above 45° N (along the ellipsoid normal): elevation 90°, range 500 km                                                                                          | ρ is parallel to the "up" axis Z of SEZ                                                                                                                                                                                                                                                                                                        | definition                             |     |
| 6.4 | Shadow with the Sun along +x: (−7000, 0, 0) dark; (−7000, 6000, 0) dark; (−7000, 6400, 0) lit; (−7000, 0, 7000) lit; (7000, 0, 0) lit; GEO at local midnight (−42164, 0, 0) dark  | Night side (x < 0) and distance from the x axis below R = 6378.137 km means inside the cylinder: 6000 < R (dark), 6400 > R (lit)                                                                                                                                                                                                               | cylindrical shadow model (SPEC.md 6.4) |     |
| 6.5 | Equinox 2026-03-20 12:00 UTC: Sun elevation > 89.5° at (0°, 1.9° E), ≈ 60° at (30° N, 1.9° E), ≈ 0° at (0°, 91.9° E)                                                              | The subsolar point is about (0°, 1.9° E) (module 1, test 1.7). Elevation = 90° − angular distance from it: 30° away gives 60°, 90° away gives 0°                                                                                                                                                                                               | module 1 reference values              |     |
| 6.6 | ISS passes over Budapest (47.4979° N, 19.0402° E), 11–13 October 2026: same passes as a scan every 1 s; rise/set within 1.5 s, highest point within 0.01°; rise and set at 10.00° | The scan finds each crossing to its 1 s step; the search uses 30 s steps then bisection                                                                                                                                                                                                                                                        | brute force                            |     |
| 6.7 | ASTRA 1KR (GEO, 19.0° E) from Budapest: up all the time, elevation ≈ 35.6°                                                                                                        | Satellite at nearly the observer's longitude: central angle γ ≈ 47.3° (geocentric latitude). tan El = (cos γ − R/r) / sin γ = (0.6782 − 0.1513) / 0.7349 = 0.717 → 35.6°. The test allows 34–36.5°                                                                                                                                             | geometry; SES's elevation tables       |     |

Also tested: our look angles agree with satellite.js's `ecfToLookAngles` (an independent implementation of the same frame) to 1e-9 rad for random observers and satellites; a pass's visible part lies inside the pass; compass points; typed coordinates.

### Compare with Heavens-Above (SPEC.md 6.5: within a minute)

ISS passes over Budapest above 10°, from the elements of the live run (epoch 2026-10-11 04:14 UTC), Budapest time (CEST), as the site lists them:

| Day        | Above 10°   | Direction | Highest | Visible     | Heavens-Above ✓ |
| ---------- | ----------- | --------- | ------- | ----------- | --------------- |
| Mon 12 Oct | 07:12–07:18 | S → E     | 23°     |             |                 |
| Mon 12 Oct | 08:48–08:55 | W → NE    | 78°     |             |                 |
| Mon 12 Oct | 10:25–10:32 | W → E     | 39°     |             |                 |
| Mon 12 Oct | 12:02–12:09 | NW → E    | 59°     |             |                 |
| Mon 12 Oct | 13:39–13:46 | W → SE    | 33°     |             |                 |
| Tue 13 Oct | 06:26–06:30 | S → E     | 15°     | 06:26–06:28 |                 |
| Tue 13 Oct | 08:01–08:08 | SW → NE   | 77°     |             |                 |
| Tue 13 Oct | 09:38–09:44 | W → NE    | 42°     |             |                 |

**How to compare:** Heavens-Above → ISS → "All passes" (not just visible ones) for Budapest. Heavens-Above lists passes from 0° or 10° depending on settings, and uses newer elements, so expect times within a minute; the "Visible" pass on Tuesday morning should appear among its visible passes. After the next `pnpm data` run the site uses newer elements, so compare what the site shows at that moment.

### What Claude checked in a real browser (Edge, time zone Europe/Budapest)

| Check                            | Result                                                                    | ✓   |
| -------------------------------- | ------------------------------------------------------------------------- | --- |
| Typing 47.4979, 19.0402 and Save | Location shown, red dot on the globe at Budapest, remembered after reload |     |
| ISS selected                     | The 8 passes above, times in Europe/Budapest                              |     |
| Clicking a pass                  | Time jumps to 30 s before the rise, the camera follows the ISS            |     |
| ASTRA 1KR (GEO) selected         | "Always above 10° here: S, about 36° high." (no rise, set or visibility)  |     |

Known limits:

- No brightness (magnitude) model: "Visible" means sunlit in a dark sky; faint satellites are marked too.
- Passes shorter than 30 s above 10° can be missed (very low grazes).
- "Use my location" needs the browser's permission; on `http://` other than localhost browsers refuse it (the hosted site will be https).
