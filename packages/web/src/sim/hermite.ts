// Interpolating satellite positions between SGP4 samples (SPEC.md 7.3).
//
// The worker runs SGP4 for every object only every SAMPLE_STEP_S seconds of shown time; the GPU
// fills in every frame in between. Straight lines between samples would cut across the curve
// of the orbit: the error is the sagitta r·(1 − cos(ωΔt/2)) ≈ r(ωΔt)²/8, so keeping it under
// 1 km in LEO (r = 6,800 km, ω = 0.00113 rad/s) needs a sample every 30 s, which at 1,000×
// speed is 33 SGP4 runs over 16,700 objects per second.
//
// Instead we use the velocity too: a cubic Hermite curve through both samples that also
// matches both velocities. Its error grows with (ωΔt)⁴ instead of (ωΔt)², so with samples
// 240 s apart the error is under 0.1 km (measured over a day against SGP4: ISS 96 m, a
// Molniya orbit through perigee 52 m; hermite.test.ts). At
// 1,000× that is about 4 samples per real second.
//
// With u = (t − tA) / h in [0, 1] and h = tB − tA:
//   p(u) = (2u³ − 3u² + 1)·pA + (u³ − 2u² + u)·h·vA + (−2u³ + 3u²)·pB + (u³ − u²)·h·vB
// The same formula is in the vertex shader of SatellitePoints.tsx; the functions themselves
// are in packages/core (hermite.ts), shared with the close-approach screening.

/** Shown time between two SGP4 samples [s] */
export const SAMPLE_STEP_S = 240;

export { hermite, hermiteWeights } from '@sat-viewer/core';
