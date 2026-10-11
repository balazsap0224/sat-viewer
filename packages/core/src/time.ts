// Time. SatViewer works in real UTC (the game used its own world clock).
//
// Instants are Unix milliseconds (UTC), as `Date.now()` and `Date.UTC(...)` return them: a
// plain number, cheap to pass to a Web Worker. The alias documents intent.
//
// Simplifications (SPEC.md 6.1, step 3): UT1 is taken as UTC. |UT1 − UTC| < 0.9 s, which
// moves the Earth's rotation by at most 0.9 s × 0.465 km/s ≈ 0.4 km at the equator, well
// below SGP4's own error. Leap seconds are ignored the same way.

export type UnixMs = number;

export const MS_PER_DAY = 86_400_000;

/** Julian Date of the Unix epoch 1970-01-01 00:00 UTC. */
export const JD_UNIX_EPOCH = 2440587.5;

/** Julian Date of J2000.0 (2000-01-01 12:00 TT, used here as UT). */
export const JD_J2000 = 2451545.0;

/** Unix ms → Julian Date (UT1 ≈ UTC). */
export const julianDate = (t: UnixMs): number => JD_UNIX_EPOCH + t / MS_PER_DAY;

/** Julian Date → Unix ms. */
export const unixMsFromJulianDate = (jd: number): UnixMs => (jd - JD_UNIX_EPOCH) * MS_PER_DAY;

/** Days since J2000.0. */
export const daysSinceJ2000 = (t: UnixMs): number => julianDate(t) - JD_J2000;

const DEG_PER_RAD = 180 / Math.PI;

export const degToRad = (deg: number): number => deg / DEG_PER_RAD;

export const radToDeg = (rad: number): number => rad * DEG_PER_RAD;

/** Wraps an angle to [0, 2π). */
export function wrapTwoPi(a: number): number {
  const w = a % (2 * Math.PI);
  const r = w < 0 ? w + 2 * Math.PI : w;
  // −1e-17 + 2π rounds to exactly 2π in floating point; keep the result in [0, 2π).
  return r >= 2 * Math.PI ? 0 : r;
}

/** Wraps degrees to (−180, 180]. */
export function wrapLon180(deg: number): number {
  const w = ((((deg + 180) % 360) + 360) % 360) - 180;
  return w === -180 ? 180 : w;
}
