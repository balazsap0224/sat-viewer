# Orbit notes

Conventions, formulas and references for `packages/core`. Every convention used in code is written here first.

## Units and time

- km, s, rad, km/s internally; degrees only at the UI boundary.
- Instants are Unix milliseconds, UTC (`UnixMs`). Julian Date: `JD = 2440587.5 + ms / 86 400 000`.
- UT1 is taken as UTC (|UT1 − UTC| < 0.9 s ⇒ < 0.4 km at the equator). Leap seconds ignored.
- OMM epochs (`"2026-10-11T04:13:59.875680"`) are UTC without a suffix; parsed to ms (sub-ms digits dropped, < 8 m along track in LEO).

## Two Earth models

| Where            | Model  | Why                                                                                                                           |
| ---------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Inside SGP4      | WGS-72 | The elements are fitted with SGP4 using WGS-72. Changing the constants would make the elements give wrong positions.          |
| Everything after | WGS-84 | The modern standard: GPS, maps and trackers use it. `R_EARTH = 6378.137 km`, `f = 1/298.257223563`, `μ = 398600.4418 km³/s²`. |

## Why SGP4, not Kepler

CelesTrak's elements are _mean_ elements: averaged values fitted to radar and optical observations _with SGP4's force model_ (Earth's J2, J3, J4 oblateness, atmospheric drag through `BSTAR`, and for periods over 225 min the Sun's and Moon's pull plus resonances). They are not osculating (instantaneous) Kepler elements. Example: the ISS's mean motion 15.48821882 rev/day gives a two-body semi-major axis of 6798.3 km, but J2 alone shifts the real mean radius by several km and turns the orbit plane by about 5° per day (nodal regression). A two-body propagator started from these numbers is tens of km off within hours. SGP4 with the same elements stays within about 1 km near the epoch, growing by 1–3 km per day in LEO.

SGP4 comes from `satellite.js` 7.1 (MIT), a port of Vallado's reference code. It is checked against the official verification set in `packages/core/test/sgp4Verification.test.ts`: 32 cases, every position within 1 m and every velocity within 1 mm/s, plus one error-code case. Notes from that test:

- Case 23599 is in the set because implementations disagree there (the "Lyddane" choice). The MATLAB 2015 reference and the Java reference differ by up to 0.96 km; satellite.js matches Java to 1e-8 km.
- The end of `tmatverDec2015.out` has a malformed line (several records without line breaks); only rows inside each TLE's requested time range are used.

## Frames

- **TEME** (True Equator, Mean Equinox): SGP4's output frame. z toward the true pole of date, x toward the mean equinox. Not rotating with the Earth.
- **ECEF**: x toward 0° latitude / 0° longitude, z toward the pole. Rotates with the Earth.
- **TEME → ECEF** is a rotation about z by −θ, where θ is the **Greenwich Mean Sidereal Time** (IAU-1982, Vallado Eq. 3-47):

  θ [s] = 67310.54841 + (876600·3600 + 8640184.812866)·T + 0.093104·T² − 6.2·10⁻⁶·T³, with T = (JD − 2451545.0) / 36525; θ [rad] = θ[s] · 2π / 86400.

  Polar motion (tens of metres) is ignored, as SPEC.md 6.1 says. This is the standard approach for SGP4 output (Vallado 4th ed., section 3.7; Vallado et al. 2006, appendix C).

## Scene mapping (web)

three = (x, z, −y) of TEME, in Earth radii. The Earth mesh is rotated by θ about the scene's y axis, so the unrotated mesh is ECEF (see `packages/web/src/scene/coords.ts`).

## Geodetic latitude, longitude, altitude (WGS-84)

- `N(φ) = a / √(1 − e² sin²φ)`, `e² = f(2 − f) = 0.00669438`.
- Geodetic → ECEF (closed form): `x = (N + h) cos φ cos λ`, `y = (N + h) cos φ sin λ`, `z = (N(1 − e²) + h) sin φ`.
- ECEF → geodetic: `λ = atan2(y, x)`; φ by fixed-point iteration `φ ← atan2(z + N e² sin φ, p)` with `p = √(x² + y²)`, from the geocentric latitude; converges to 1e-13 rad in a few steps. Height `h = p / cos φ − N` (or `z / sin φ − N(1 − e²)` within ~6° of a pole). Reference: Vallado Alg. 12; checked against Vallado Example 3-3 and against satellite.js `eciToGeodetic`.
- Geodetic vs geocentric latitude: `tan ψ = (N(1 − e²) + h) / (N + h) · tan φ`. At φ = 45°, h = 400 km: ψ = 44.819°, so the difference is 0.18° (≈ 20 km on the ground).

## Derived values

- Period `P = 1440 / n` min (n in rev/day).
- Semi-major axis `a = (μ / n²)^(1/3)` with n in rad/s. This is a two-body "Kozai" value; SGP4's internal (Brouwer) mean axis differs by up to ~10 km in LEO. Good enough for the info card and classes, never used for positions.
- Perigee / apogee altitude `a(1 ∓ e) − R` (above the equatorial radius, as SATCAT gives them).
- Orbit classes ([PROPOSED], `ORBIT_CLASS_RULES` in `derived.ts`), checked in order: **HEO** if e > 0.25; if the period is within 1 % of a sidereal day: **GEO** if i < 10°, otherwise **IGSO** (inclined geosynchronous: QZSS, BeiDou IGSO, NavIC, and old GEO satellites whose inclination has grown; seen from the ground they trace a figure 8 over a fixed longitude instead of standing still); **LEO** if apogee < 2,000 km; otherwise **MEO**.
- Element age `(t − epoch)`; over 14 days is "stale" ([PROPOSED]).

## Failures

SGP4 reports errors (eccentricity out of range, decayed, …). The data job leaves out objects that fail at build time and lists them in `meta.json` (`skipped`); the site also checks every position and hides an object the moment SGP4 fails for it.
