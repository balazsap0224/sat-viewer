// Low-precision Sun position, for the day/night globe and (Phase 2) pass visibility.
// Copied from the game (packages/physics/src/sun.ts), now on real UTC.
//
// Astronomical Almanac formula (also Meeus, "Astronomical Algorithms", ch. 25 low-accuracy;
// Vallado, 4th ed., Alg. 29). Accuracy about 0.01° between 1950 and 2050, far finer than
// the soft twilight band drawn on the globe. With n = days since J2000.0:
//   mean longitude     L = 280.460° + 0.9856474°·n
//   mean anomaly       g = 357.528° + 0.9856003°·n
//   ecliptic longitude λ = L + 1.915°·sin g + 0.020°·sin 2g
//   obliquity          ε = 23.439° − 0.0000004°·n
// The Sun lies in the ecliptic (latitude ≈ 0), so its direction in the inertial frame is
//   (cos λ, cos ε·sin λ, sin ε·sin λ).
// This is a mean-of-date direction; the difference from TEME (nutation, < 0.01°) is far
// below the formula's own accuracy, so it is used directly with SGP4 positions.

import { daysSinceJ2000, type UnixMs } from './time';
import { type Vec3, vec3 } from './vector';

const DEG = Math.PI / 180;

/** Unit vector from Earth's centre toward the Sun, in the inertial frame (≈ TEME). */
export function sunDirectionEci(t: UnixMs): Vec3 {
  const n = daysSinceJ2000(t);
  const L = 280.46 + 0.9856474 * n;
  const g = (357.528 + 0.9856003 * n) * DEG;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG;
  const epsilon = (23.439 - 0.0000004 * n) * DEG;
  return vec3(
    Math.cos(lambda),
    Math.cos(epsilon) * Math.sin(lambda),
    Math.sin(epsilon) * Math.sin(lambda),
  );
}
