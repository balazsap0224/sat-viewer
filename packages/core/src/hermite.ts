// Cubic Hermite interpolation between two samples of a moving point (SPEC.md 7.3), used by
// the site to draw every satellite between SGP4 samples and by the close-approach screening
// (encounters.ts).
//
// A cubic Hermite curve passes through both sample positions and matches both velocities.
// Its error grows with (ωΔt)⁴, so with samples 240 s apart the error stays under 0.1 km
// (measured over a day against SGP4: ISS 96 m, a Molniya orbit through perigee 52 m; the
// site's hermite.test.ts).
//
// With u = (t − tA) / h in [0, 1] and h = tB − tA:
//   p(u)  = (2u³ − 3u² + 1)·pA + (u³ − 2u² + u)·h·vA + (−2u³ + 3u²)·pB + (u³ − u²)·h·vB
//   p'(t) = [(6u² − 6u)·pA + (3u² − 4u + 1)·h·vA + (−6u² + 6u)·pB + (3u² − 2u)·h·vB] / h

/** The four Hermite basis weights at u ∈ [0, 1]. */
export function hermiteWeights(u: number): readonly [number, number, number, number] {
  const u2 = u * u;
  const u3 = u2 * u;
  return [2 * u3 - 3 * u2 + 1, u3 - 2 * u2 + u, -2 * u3 + 3 * u2, u3 - u2];
}

/**
 * One coordinate between two samples: positions pA, pB, velocities vA, vB (per second),
 * h seconds apart, at fraction u.
 */
/** The derivatives d/du of the four weights (divide by h for a rate per second). */
export function hermiteRateWeights(u: number): readonly [number, number, number, number] {
  const u2 = u * u;
  return [6 * u2 - 6 * u, 3 * u2 - 4 * u + 1, -6 * u2 + 6 * u, 3 * u2 - 2 * u];
}

export function hermite(
  pA: number,
  vA: number,
  pB: number,
  vB: number,
  h: number,
  u: number,
): number {
  const [a, b, c, d] = hermiteWeights(u);
  return a * pA + b * h * vA + c * pB + d * h * vB;
}
