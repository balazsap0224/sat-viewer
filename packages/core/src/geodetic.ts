// Latitude, longitude and altitude on the WGS-84 ellipsoid (SPEC.md 6.1 step 4).
//
// The Earth is not a sphere: it is flattened by f = 1/298.257, so the polar radius is 21.4 km
// shorter than the equatorial one. *Geodetic* latitude φ is the angle between the equator and
// the ellipsoid's surface normal (what maps and GPS use); *geocentric* latitude is the angle
// of the line to Earth's centre. For a satellite at 400 km they differ by up to about 0.19°
// (≈ 21 km on the ground), which is visible on a ground track. The game used a sphere.
//
// Conventions: docs/orbit-notes.md. References: Vallado 4th ed. Alg. 12 (ECEF2LLA) and
// Eq. 3-14; NIMA TR8350.2 (WGS-84 definition).

import { E2_EARTH, R_EARTH } from './constants';
import { ecefToTeme, temeToEcef } from './frames';
import { radToDeg, type UnixMs, wrapLon180 } from './time';
import { type Vec3, vec3 } from './vector';

export interface Geodetic {
  /** Geodetic latitude [deg], −90..90 */
  readonly latDeg: number;
  /** Longitude [deg], (−180, 180], east positive */
  readonly lonDeg: number;
  /** Height above the WGS-84 ellipsoid [km] */
  readonly altKm: number;
}

/**
 * Geodetic → ECEF [km] (closed form, Vallado Eq. 3-14):
 *   N = a / √(1 − e² sin²φ)          (radius of curvature in the prime vertical)
 *   x = (N + h) cos φ cos λ
 *   y = (N + h) cos φ sin λ
 *   z = (N(1 − e²) + h) sin φ
 */
export function geodeticToEcef(latRad: number, lonRad: number, altKm: number): Vec3 {
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const N = R_EARTH / Math.sqrt(1 - E2_EARTH * sinLat * sinLat);
  return vec3(
    (N + altKm) * cosLat * Math.cos(lonRad),
    (N + altKm) * cosLat * Math.sin(lonRad),
    (N * (1 - E2_EARTH) + altKm) * sinLat,
  );
}

/**
 * ECEF [km] → geodetic. There is no simple closed form the other way, so φ is found by fixed-
 * point iteration (Vallado Alg. 12), starting from the geocentric latitude:
 *
 *   p = √(x² + y²)                           distance from the polar axis
 *   φ ← atan2(z + N e² sin φ, p)            with N = a / √(1 − e² sin²φ)
 *
 * The term N e² sin φ is how far below the centre the surface normal crosses the polar
 * axis. Each step gains about 3 digits; 10 steps is far more than needed (converges to
 * 1e-12 rad in 3–4 steps for anything from the ground to beyond GEO).
 *
 * Height: h = p / cos φ − N, which loses precision near the poles; there
 * h = z / sin φ − N(1 − e²) is used instead (both are exact on the ellipsoid normal).
 */
export function ecefToGeodetic(r: Vec3): Geodetic {
  const p = Math.hypot(r.x, r.y);
  const radiusOfCurvature = (sinLat: number) => R_EARTH / Math.sqrt(1 - E2_EARTH * sinLat * sinLat);
  let lat = Math.atan2(r.z, p);
  for (let i = 0; i < 10; i++) {
    const sinLat = Math.sin(lat);
    const next = Math.atan2(r.z + radiusOfCurvature(sinLat) * E2_EARTH * sinLat, p);
    const done = Math.abs(next - lat) < 1e-13;
    lat = next;
    if (done) break;
  }
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const N = radiusOfCurvature(sinLat);
  const altKm = Math.abs(cosLat) > 0.1 ? p / cosLat - N : r.z / sinLat - N * (1 - E2_EARTH);
  return {
    latDeg: radToDeg(lat),
    lonDeg: wrapLon180(radToDeg(Math.atan2(r.y, r.x))),
    altKm,
  };
}

/** TEME position at time t → latitude/longitude/altitude (WGS-84). */
export function temeToGeodetic(r: Vec3, t: UnixMs): Geodetic {
  return ecefToGeodetic(temeToEcef(r, t));
}

/** A point on (or above) the Earth at time t → TEME position. */
export function geodeticToTeme(latRad: number, lonRad: number, altKm: number, t: UnixMs): Vec3 {
  return ecefToTeme(geodeticToEcef(latRad, lonRad, altKm), t);
}
