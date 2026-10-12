// "What can I see tonight?" helpers for the passes panel when no satellite is selected
// (SPEC.md 7.2 "My location").
//
// 1. The dark-sky window: when the Sun is more than 6° below the observer's horizon (the end
//    of civil twilight, the same rule as a pass's "visible" part, passes.ts). Found by
//    stepping the Sun's elevation every 5 minutes and bisecting each crossing.
// 2. A relative brightness for ranking satellites. We have no magnitudes, so this is a rough
//    proxy: a satellite reflects light in proportion to its cross-section, which grows like
//    mass^(2/3) for objects of similar density (area ∝ length², mass ∝ length³); the light
//    reaching us falls with distance². In magnitudes (smaller = brighter, ×100 in light = 5 mag):
//      m_rel = −2.5 log10(mass^(2/3)) + 5 log10(range / 1000 km)
//    It only orders satellites; it is not a magnitude anyone could look up, and it ignores
//    the shape, the material and the angle between the Sun and the observer.

import { type Observer, sunElevation } from './look';
import { DARK_SKY_SUN_ELEVATION_RAD } from './passes';
import type { UnixMs } from './time';

const SUN_STEP_MS = 5 * 60_000;

/** Time in [a, b] where the Sun's elevation crosses −6°, to 1 s. */
function bisectDark(observer: Observer, a: number, b: number): number {
  const aDark = sunElevation(observer, a) < DARK_SKY_SUN_ELEVATION_RAD;
  while (b - a > 1000) {
    const m = (a + b) / 2;
    if (sunElevation(observer, m) < DARK_SKY_SUN_ELEVATION_RAD === aDark) a = m;
    else b = m;
  }
  return (a + b) / 2;
}

/**
 * The first stretch of dark sky (Sun below −6°) between `from` and `to`, or null if the sky
 * stays bright. If it is already dark at `from`, the window starts at `from`; if it is still
 * dark at `to`, it ends at `to`.
 */
export function nextDarkWindow(
  observer: Observer,
  from: UnixMs,
  to: UnixMs,
): { from: UnixMs; to: UnixMs } | null {
  const dark = (t: number) => sunElevation(observer, t) < DARK_SKY_SUN_ELEVATION_RAD;
  let start: number | undefined = dark(from) ? from : undefined;
  let prevT = from;
  let prevDark = start !== undefined;
  for (let t = from + SUN_STEP_MS; prevT < to; t += SUN_STEP_MS) {
    const tt = Math.min(t, to);
    const d = dark(tt);
    if (d !== prevDark) {
      const edge = bisectDark(observer, prevT, tt);
      if (d) start = edge;
      else if (start !== undefined) return { from: start, to: edge };
    }
    prevT = tt;
    prevDark = d;
  }
  return start !== undefined ? { from: start, to } : null;
}

/**
 * Relative brightness [magnitudes, smaller = brighter] of a satellite of `massKg` seen from
 * `rangeKm` away. For ranking only (see the top of this file).
 */
export function relativeMagnitude(massKg: number, rangeKm: number): number {
  return -2.5 * Math.log10(massKg ** (2 / 3)) + 5 * Math.log10(rangeKm / 1000);
}
