// Where a satellite appears in an observer's sky, and whether it can be seen (SPEC.md 6.4).
//
// Look angles: the vector from the observer to the satellite, both in ECEF, turned into the
// observer's local "topocentric horizon" frame SEZ (Vallado 4th ed., Alg. 27 RAZEL):
//   S  points south along the ground, E points east, Z points up along the WGS-84 normal.
// Then azimuth is measured from north, clockwise (north 0°, east 90°), and elevation from
// the horizon up.
//
// Visibility to the naked eye needs three things at once: the satellite above the horizon,
// the satellite in sunlight, and the observer's sky dark enough (Sun more than 6° below the
// horizon: the end of civil twilight). Brightness (magnitude) is not modelled.

import { R_EARTH } from './constants';
import { temeToEcef } from './frames';
import { geodeticToEcef } from './geodetic';
import { sunDirectionEci } from './sun';
import type { UnixMs } from './time';
import { dot, norm, scale, sub, type Vec3 } from './vector';

/** A place on the Earth (WGS-84). */
export interface Observer {
  readonly latRad: number;
  readonly lonRad: number;
  /** Height above the ellipsoid [km] */
  readonly altKm: number;
}

export interface LookAngles {
  /** Azimuth [rad], 0 = north, π/2 = east, in [0, 2π) */
  readonly azRad: number;
  /** Elevation above the horizon [rad], −π/2..π/2 */
  readonly elRad: number;
  /** Distance from the observer [km] */
  readonly rangeKm: number;
}

/**
 * Look angles from an observer to a point given in ECEF [km].
 *
 * With ρ = r_sat − r_obs (ECEF), latitude φ and longitude λ of the observer:
 *   ρS =  sin φ cos λ ρx + sin φ sin λ ρy − cos φ ρz
 *   ρE = −sin λ ρx       + cos λ ρy
 *   ρZ =  cos φ cos λ ρx + cos φ sin λ ρy + sin φ ρz
 *   elevation = asin(ρZ / |ρ|),   azimuth = atan2(ρE, −ρS)
 * (−ρS is the northward part, so atan2(east, north) counts clockwise from north.)
 */
export function lookAnglesEcef(observer: Observer, satEcef: Vec3): LookAngles {
  const o = geodeticToEcef(observer.latRad, observer.lonRad, observer.altKm);
  const rho = sub(satEcef, o);
  const sinLat = Math.sin(observer.latRad);
  const cosLat = Math.cos(observer.latRad);
  const sinLon = Math.sin(observer.lonRad);
  const cosLon = Math.cos(observer.lonRad);
  const s = sinLat * cosLon * rho.x + sinLat * sinLon * rho.y - cosLat * rho.z;
  const e = -sinLon * rho.x + cosLon * rho.y;
  const z = cosLat * cosLon * rho.x + cosLat * sinLon * rho.y + sinLat * rho.z;
  const range = norm(rho);
  let az = Math.atan2(e, -s);
  if (az < 0) az += 2 * Math.PI;
  return { azRad: az, elRad: Math.asin(z / range), rangeKm: range };
}

/** Look angles from an observer to a satellite at TEME position r at time t. */
export const lookAngles = (observer: Observer, rTeme: Vec3, t: UnixMs): LookAngles =>
  lookAnglesEcef(observer, temeToEcef(rTeme, t));

/**
 * Is a satellite at r (TEME/inertial) in sunlight? Cylindrical Earth shadow: the shadow is a
 * cylinder of radius R behind the Earth, away from the Sun. The satellite is in it when it is
 * on the night side (r·ŝ < 0) and its distance from the Earth–Sun line, |r − (r·ŝ)ŝ|, is less
 * than R. (The real umbra is a cone narrowing over 1.4 million km, so the cylinder is good to
 * a few seconds at shadow entry for LEO.) ŝ is the unit vector to the Sun.
 */
export function isSunlit(r: Vec3, sunDir: Vec3): boolean {
  const along = dot(r, sunDir);
  if (along >= 0) return true;
  return norm(sub(r, scale(sunDir, along))) >= R_EARTH;
}

/**
 * The Sun's elevation [rad] for an observer at time t: the angle between the observer's
 * horizon and the Sun's direction. The Sun is so far away (150 million km) that the
 * direction from the observer equals the direction from the Earth's centre (parallax 0.002°),
 * so elevation = asin(up · ŝ) with "up" the WGS-84 normal (cos φ cos λ, cos φ sin λ, sin φ)
 * and ŝ the Sun's direction in ECEF.
 */
export function sunElevation(observer: Observer, t: UnixMs): number {
  const s = temeToEcef(sunDirectionEci(t), t);
  const cosLat = Math.cos(observer.latRad);
  const up = {
    x: cosLat * Math.cos(observer.lonRad),
    y: cosLat * Math.sin(observer.lonRad),
    z: Math.sin(observer.latRad),
  };
  return Math.asin(Math.max(-1, Math.min(1, dot(up, s))));
}
