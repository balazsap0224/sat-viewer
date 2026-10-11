// Physical constants. Units: km, s, rad (SPEC.md 6.2, docs/orbit-notes.md).
//
// Two Earth models are in play and must never be mixed:
// - SGP4 uses the WGS-72 constants internally, because the elements are fitted with them.
//   Those live inside satellite.js; this file does not repeat them.
// - Everything after SGP4 (frames, latitude/longitude, derived values) uses WGS-84, below.

/** Earth's gravitational parameter GM [km^3/s^2] (WGS-84 / EGM96 value). */
export const MU_EARTH = 398600.4418;

/** Earth's equatorial radius [km] (WGS-84). */
export const R_EARTH = 6378.137;

/** Earth's flattening f = (a − b) / a (WGS-84, defining value 1/298.257223563). */
export const FLATTENING = 1 / 298.257223563;

/** Earth's polar radius b = a(1 − f) [km] ≈ 6356.752 km (WGS-84). */
export const R_POLAR = R_EARTH * (1 - FLATTENING);

/** First eccentricity squared of the WGS-84 ellipsoid: e² = f(2 − f) ≈ 0.00669438. */
export const E2_EARTH = FLATTENING * (2 - FLATTENING);

/** Earth's rotation rate relative to the stars (sidereal) [rad/s] (WGS-84). */
export const OMEGA_EARTH = 7.292115e-5;

/** One sidereal day [s] ≈ 86,164.1 s (23 h 56 min 4 s). */
export const SIDEREAL_DAY_S = (2 * Math.PI) / OMEGA_EARTH;

/** Minutes in a day, for mean motion in revolutions per day. */
export const MINUTES_PER_DAY = 1440;
