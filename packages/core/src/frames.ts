// Reference frames and Earth rotation (SPEC.md 6.1). Conventions: docs/orbit-notes.md.
//
// TEME (True Equator, Mean Equinox): the inertial-ish frame SGP4 works in. z toward the
//      true North Pole of date, x toward the mean vernal equinox. Does not rotate with the
//      Earth. Satellite positions from SGP4 are in this frame.
// ECEF (Earth-centred, Earth-fixed): x toward 0° latitude / 0° longitude (Greenwich),
//      z toward the North Pole. Rotates with the Earth. Used for latitude/longitude.
// The two differ by a rotation about z by the Greenwich Mean Sidereal Time θ = gmst(t)
// (Vallado, 4th ed., section 3.7 and Eq. 3-90; polar motion ignored, see SPEC.md 6.1).

import { julianDate, JD_J2000, type UnixMs, wrapTwoPi } from './time';
import { type Vec3, vec3 } from './vector';

/**
 * Greenwich Mean Sidereal Time θ(t) [rad] in [0, 2π), IAU-1982 model.
 *
 * Vallado, 4th ed., Eq. 3-47 (the form used with SGP4, and the one in satellite.js
 * `gstime`), with T = Julian centuries of UT1 since J2000.0:
 *
 *   θ [seconds of time] = 67310.54841 + (876600 h · 3600 + 8640184.812866)·T
 *                         + 0.093104·T² − 6.2e-6·T³
 *
 * One second of time is 360°/86400 s = 1/240 degree, so θ [rad] = θ[s] · (2π / 86400).
 */
export function gmst(t: UnixMs): number {
  const T = (julianDate(t) - JD_J2000) / 36525;
  const seconds =
    67310.54841 + (876600 * 3600 + 8640184.812866) * T + 0.093104 * T * T - 6.2e-6 * T * T * T;
  return wrapTwoPi(((seconds % 86400) * 2 * Math.PI) / 86400);
}

/** Rotates a TEME vector into ECEF at time t: Rz(−θ). */
export function temeToEcef(r: Vec3, t: UnixMs): Vec3 {
  return rotateZ(r, -gmst(t));
}

/** Rotates an ECEF vector into TEME at time t: Rz(+θ). */
export function ecefToTeme(r: Vec3, t: UnixMs): Vec3 {
  return rotateZ(r, gmst(t));
}

/** Rotates a vector about the z axis by angle a [rad] (counter-clockwise seen from +z). */
function rotateZ(r: Vec3, a: number): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return vec3(c * r.x - s * r.y, s * r.x + c * r.y, r.z);
}
