// Values derived from the mean elements, for the info card and the filters (SPEC.md 6.3).
//
// These use the two-body relations with the WGS-84 μ and radius. Mean motion from SGP4
// elements is a "Kozai" mean value that includes J2 averaging, so the semi-major axis from
// it differs from SGP4's internal (Brouwer) one by up to ~10 km in LEO. That is fine for an
// info card and for classifying orbits; positions always come from SGP4.

import { MINUTES_PER_DAY, MU_EARTH, R_EARTH, SIDEREAL_DAY_S } from './constants';

/** Orbital period [min] from mean motion n [rev/day]: P = 1440 / n. */
export const periodMinutes = (meanMotionRevPerDay: number): number =>
  MINUTES_PER_DAY / meanMotionRevPerDay;

/**
 * Semi-major axis [km] from mean motion, by Kepler's third law: n² a³ = μ, so
 * a = (μ / n²)^(1/3), with n in rad/s: n = revPerDay · 2π / 86400.
 */
export function semiMajorAxisKm(meanMotionRevPerDay: number): number {
  const n = (meanMotionRevPerDay * 2 * Math.PI) / 86400;
  return Math.cbrt(MU_EARTH / (n * n));
}

/** Perigee and apogee altitude [km] above the equatorial radius: a(1 ∓ e) − R. */
export function apsidesKm(
  meanMotionRevPerDay: number,
  eccentricity: number,
): { readonly perigeeKm: number; readonly apogeeKm: number } {
  const a = semiMajorAxisKm(meanMotionRevPerDay);
  return {
    perigeeKm: a * (1 - eccentricity) - R_EARTH,
    apogeeKm: a * (1 + eccentricity) - R_EARTH,
  };
}

export type OrbitClass = 'LEO' | 'MEO' | 'GEO' | 'IGSO' | 'HEO';

/** Thresholds for the orbit classes (SPEC.md 6.3, [PROPOSED]: easy to change here). */
export const ORBIT_CLASS_RULES = {
  /** LEO: apogee below this altitude [km] */
  leoMaxApogeeKm: 2000,
  /** GEO and IGSO (geosynchronous): period within this fraction of a sidereal day… */
  geoPeriodTolerance: 0.01,
  /** …and inclination below this [deg] for GEO; at or above it, IGSO */
  geoMaxInclinationDeg: 10,
  /** HEO: eccentricity above this */
  heoMinEccentricity: 0.25,
} as const;

/**
 * Orbit class (SPEC.md 6.3). Checked in this order: HEO (very elliptical: Molniya, Tundra,
 * GTO, science orbits); geosynchronous (period ≈ one sidereal day), split into GEO
 * (near-equatorial, appears fixed in the sky) and IGSO (inclined: QZSS, BeiDou IGSO, old GEO
 * satellites that have drifted to a higher inclination; traces a figure 8 over one longitude);
 * LEO (whole orbit below 2,000 km); otherwise MEO (navigation satellites, O3b).
 */
export function orbitClass(
  meanMotionRevPerDay: number,
  eccentricity: number,
  inclinationDeg: number,
): OrbitClass {
  const R = ORBIT_CLASS_RULES;
  if (eccentricity > R.heoMinEccentricity) return 'HEO';
  const periodS = periodMinutes(meanMotionRevPerDay) * 60;
  if (Math.abs(periodS / SIDEREAL_DAY_S - 1) < R.geoPeriodTolerance) {
    return inclinationDeg < R.geoMaxInclinationDeg ? 'GEO' : 'IGSO';
  }
  if (apsidesKm(meanMotionRevPerDay, eccentricity).apogeeKm < R.leoMaxApogeeKm) return 'LEO';
  return 'MEO';
}

/** Elements older than this [days] are marked "stale" (SPEC.md 6.1 step 5, [PROPOSED]). */
export const STALE_AFTER_DAYS = 14;

/** Age of an element set at time t [days] (negative when the epoch is after t). */
export const elementAgeDays = (epochMs: number, t: number): number => (t - epochMs) / 86_400_000;
