// Passes of a satellite over an observer (SPEC.md 6.4).
//
// A pass is the time the satellite spends above a minimum elevation ([PROPOSED] 10°: lower
// than that, buildings, trees and haze usually hide it). The search:
//   1. Step through the window every 30 s and compute the elevation.
//   2. Where it crosses the threshold between two steps, find the exact crossing by
//      bisection (halving the interval until it is under 0.1 s).
//   3. The highest point (culmination) is the best step, refined by golden-section search
//      in the steps either side (elevation has a single peak there).
//   4. Visibility: every 5 s during the pass, check "satellite in sunlight and Sun below
//      −6° for the observer" (look.ts); the first and last such moments are the visible part.
// A pass shorter than one step (30 s) above the threshold can be missed; such passes are
// low grazes that are hard to see anyway.

import { lookAngles, type Observer, isSunlit, sunElevation } from './look';
import { propagateAt, type SatRec } from './sgp4';
import { sunDirectionEci } from './sun';
import { degToRad, type UnixMs } from './time';

export interface PassOptions {
  /** Minimum elevation [rad] (default 10°, [PROPOSED] SPEC.md 6.4) */
  readonly minElevationRad?: number;
  /** Coarse step [s] (default 30) */
  readonly stepS?: number;
  /** Stop after this many passes (default 10) */
  readonly maxPasses?: number;
}

export const DEFAULT_MIN_ELEVATION_RAD = degToRad(10);
/** Sun elevation below which the sky counts as dark enough: civil twilight ends at −6° */
export const DARK_SKY_SUN_ELEVATION_RAD = degToRad(-6);
const VISIBILITY_STEP_MS = 5_000;

export interface PassPoint {
  readonly t: UnixMs;
  readonly azRad: number;
  readonly elRad: number;
}

export interface Pass {
  /** Crossing the minimum elevation upwards (or the window start, if already up) */
  readonly rise: PassPoint;
  /** Highest point */
  readonly culmination: PassPoint;
  /** Crossing the minimum elevation downwards (or the window end, if still up) */
  readonly set: PassPoint;
  /** True when the satellite was already up at the start of the window */
  readonly startsBeforeWindow: boolean;
  /** True when the satellite is still up at the end of the window */
  readonly endsAfterWindow: boolean;
  /** When it can be seen with the naked eye (sunlit, dark sky), or null */
  readonly visible: { readonly from: UnixMs; readonly to: UnixMs } | null;
}

/** Look angles at time t, or undefined where SGP4 fails (treated as below the horizon). */
function lookAt(satrec: SatRec, observer: Observer, t: UnixMs): PassPoint | undefined {
  const s = propagateAt(satrec, t);
  if (!s.ok) return undefined;
  const la = lookAngles(observer, s.r, t);
  return { t, azRad: la.azRad, elRad: la.elRad };
}

const elevation = (satrec: SatRec, observer: Observer, t: UnixMs): number =>
  lookAt(satrec, observer, t)?.elRad ?? -Math.PI / 2;

/** Time in [a, b] where the elevation crosses `threshold`, given f(a) and f(b) on opposite sides. */
function bisect(f: (t: number) => number, a: number, b: number, threshold: number): number {
  const aBelow = f(a) < threshold;
  while (b - a > 100) {
    const m = (a + b) / 2;
    if (f(m) < threshold === aBelow) a = m;
    else b = m;
  }
  return (a + b) / 2;
}

/** Time of the maximum of f in [a, b] (single peak), by golden-section search, to 0.1 s. */
function goldenMax(f: (t: number) => number, a: number, b: number): number {
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a);
  let d = a + g * (b - a);
  let fc = f(c);
  let fd = f(d);
  while (b - a > 100) {
    if (fc > fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - g * (b - a);
      fc = f(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + g * (b - a);
      fd = f(d);
    }
  }
  return (a + b) / 2;
}

/** Naked-eye visibility during [from, to]: the first and last visible sample, or null. */
function visibleSpan(
  satrec: SatRec,
  observer: Observer,
  from: UnixMs,
  to: UnixMs,
): { from: UnixMs; to: UnixMs } | null {
  let first: UnixMs | undefined;
  let last: UnixMs | undefined;
  for (let t = from; t <= to; t += VISIBILITY_STEP_MS) {
    const s = propagateAt(satrec, t);
    if (!s.ok) continue;
    if (
      sunElevation(observer, t) < DARK_SKY_SUN_ELEVATION_RAD &&
      isSunlit(s.r, sunDirectionEci(t))
    ) {
      first ??= t;
      last = t;
    }
  }
  return first !== undefined && last !== undefined ? { from: first, to: last } : null;
}

/** Passes over the observer between `from` and `to` (Unix ms), in time order. */
export function findPasses(
  satrec: SatRec,
  observer: Observer,
  from: UnixMs,
  to: UnixMs,
  options: PassOptions = {},
): Pass[] {
  const threshold = options.minElevationRad ?? DEFAULT_MIN_ELEVATION_RAD;
  const step = (options.stepS ?? 30) * 1000;
  const maxPasses = options.maxPasses ?? 10;
  const f = (t: number) => elevation(satrec, observer, t);
  const point = (t: number): PassPoint =>
    lookAt(satrec, observer, t) ?? { t, azRad: 0, elRad: f(t) };

  const passes: Pass[] = [];
  let prevT = from;
  let prevEl = f(from);
  let riseT: number | undefined = prevEl >= threshold ? from : undefined;
  let startsBefore = riseT !== undefined;
  let best = { t: from, el: prevEl };

  const finish = (setT: number, endsAfter: boolean) => {
    const peakFrom = Math.max(riseT!, best.t - step);
    const peakTo = Math.min(setT, best.t + step);
    const peakT = goldenMax(f, peakFrom, peakTo);
    passes.push({
      rise: point(riseT!),
      culmination: point(f(peakT) >= best.el ? peakT : best.t),
      set: point(setT),
      startsBeforeWindow: startsBefore,
      endsAfterWindow: endsAfter,
      visible: visibleSpan(satrec, observer, riseT!, setT),
    });
    riseT = undefined;
    startsBefore = false;
  };

  for (let t = from + step; passes.length < maxPasses; t += step) {
    const tt = Math.min(t, to);
    const el = f(tt);
    if (riseT === undefined && prevEl < threshold && el >= threshold) {
      riseT = bisect(f, prevT, tt, threshold);
      best = { t: tt, el };
    } else if (riseT !== undefined) {
      if (el > best.el) best = { t: tt, el };
      if (el < threshold) finish(bisect(f, prevT, tt, threshold), false);
    }
    prevT = tt;
    prevEl = el;
    if (tt >= to) break;
  }
  if (riseT !== undefined && passes.length < maxPasses) finish(to, true);
  return passes;
}
