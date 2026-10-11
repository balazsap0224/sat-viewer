// Coverage footprint of a satellite (SPEC.md 7.1): the circle on the ground from which the
// satellite is above the horizon (or above a minimum elevation). Copied from the game
// (packages/physics/src/footprint.ts), plus `smallCircle` to draw it.
//
// Spherical Earth of radius R_EARTH (equatorial). The flattening changes the footprint's
// edge by at most about 0.3 %, invisible at the scale it is drawn; positions of the
// satellite itself still come from SGP4 and WGS-84.

import { R_EARTH } from './constants';

/**
 * Earth central angle λ [rad] from the sub-satellite point to the edge of the footprint: the
 * ground from which a satellite at altitude `altKm` is at least `minElevationRad` above the
 * horizon.
 *
 *   λ = acos( R / (R + h) · cos ε ) − ε
 *
 * Triangle Earth centre O, satellite S, user U at the footprint edge: the angle at U between
 * the local vertical and S is 90° + ε, so by the sine rule the angle at S is
 * η = asin( R cos ε / (R + h) ), and the angles sum to 180°: λ = 90° − ε − η, which equals
 * the formula above because acos(x) = 90° − asin(x). Reference: Wertz & Larson, "Space Mission
 * Analysis and Design", 3rd ed., section 5.2.
 *
 * For ε = 0 (the horizon) this is simply λ = acos(R / (R + h)).
 * Returns 0 for a satellite at or below the surface.
 */
export function footprintHalfAngle(altKm: number, minElevationRad: number): number {
  if (altKm <= 0) return 0;
  return Math.max(
    0,
    Math.acos((R_EARTH / (R_EARTH + altKm)) * Math.cos(minElevationRad)) - minElevationRad,
  );
}

/**
 * Angle at the Earth's centre between two points on the surface [rad] (great-circle distance
 * divided by R). Haversine form: accurate for small angles, where the plain
 * acos(sin·sin + cos·cos·cos) form loses digits.
 */
export function centralAngle(
  lat1Rad: number,
  lon1Rad: number,
  lat2Rad: number,
  lon2Rad: number,
): number {
  const sinDLat = Math.sin((lat2Rad - lat1Rad) / 2);
  const sinDLon = Math.sin((lon2Rad - lon1Rad) / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1Rad) * Math.cos(lat2Rad) * sinDLon * sinDLon;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface LatLonRad {
  readonly latRad: number;
  readonly lonRad: number;
}

/**
 * `n` points on the circle at central angle `angleRad` around a centre point (the footprint
 * edge around the sub-satellite point). Each point is the "destination point" from the
 * centre along bearing θ (clockwise from north), angular distance δ:
 *
 *   φ₂ = asin( sin φ₁ cos δ + cos φ₁ sin δ cos θ )
 *   λ₂ = λ₁ + atan2( sin θ sin δ cos φ₁,  cos δ − sin φ₁ sin φ₂ )
 *
 * (spherical trigonometry; e.g. Williams, "Aviation Formulary").
 */
export function smallCircle(
  latRad: number,
  lonRad: number,
  angleRad: number,
  n: number,
): LatLonRad[] {
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const sinD = Math.sin(angleRad);
  const cosD = Math.cos(angleRad);
  const points: LatLonRad[] = [];
  for (let k = 0; k < n; k++) {
    const bearing = (2 * Math.PI * k) / n;
    const lat2 = Math.asin(
      Math.min(1, Math.max(-1, sinLat * cosD + cosLat * sinD * Math.cos(bearing))),
    );
    const lon2 =
      lonRad + Math.atan2(Math.sin(bearing) * sinD * cosLat, cosD - sinLat * Math.sin(lat2));
    points.push({ latRad: lat2, lonRad: lon2 });
  }
  return points;
}
