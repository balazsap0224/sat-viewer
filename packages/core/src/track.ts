// The selected satellite's orbit line and ground track (SPEC.md 7.1).
//
// Orbit line: positions in TEME over one orbital period, half a period either side of t.
// TEME does not turn with the Earth, so the line is the (almost) closed ellipse the
// satellite flies around; drawn in the inertial scene it stays put while the Earth turns
// underneath. "Almost": in one period the orbit's plane turns (the ISS's node moves 0.32°
// west, about 38 km) and drag lowers it a little, so the two ends miss each other by tens of
// km. Centred on t, that seam lies on the far side of the orbit, not at the satellite, where
// it would show as a break in the line when zoomed in (owner, 2026-10-13).
// Ground track: the sub-satellite point (latitude/longitude, WGS-84) from one period before t
// to one period after. It is fixed to the ground, so it is drawn on the turning globe. Each
// orbit's track is shifted west of the last because the Earth turns under the orbit (by
// 360° · P / sidereal day, about 23° for the ISS).
//
// Both are sampled with SGP4, so they include the drift of the orbit (J2, drag); they are not
// ideal Kepler ellipses. Points where SGP4 fails are left out.

import { periodMinutes } from './derived';
import { type Geodetic, temeToGeodetic } from './geodetic';
import { propagateAt, type SatRec } from './sgp4';
import type { UnixMs } from './time';
import type { Vec3 } from './vector';

/** Longest span drawn either side of t [min] (2 days), for orbits with periods of days. */
export const MAX_TRACK_SPAN_MIN = 2 * 1440;

/** Time span [min] covered either side of t: one period, at most MAX_TRACK_SPAN_MIN. */
export const trackSpanMinutes = (meanMotionRevPerDay: number): number =>
  Math.min(periodMinutes(meanMotionRevPerDay), MAX_TRACK_SPAN_MIN);

/** `n + 1` evenly spaced times from `from` to `to` (inclusive). */
function times(from: UnixMs, to: UnixMs, n: number): UnixMs[] {
  return Array.from({ length: n + 1 }, (_, k) => from + ((to - from) * k) / n);
}

/** TEME positions [km] over one orbit, from half a period before t to half a period after (n segments, so n + 1 points). */
export function orbitPath(
  satrec: SatRec,
  meanMotionRevPerDay: number,
  t: UnixMs,
  n: number,
): Vec3[] {
  const span = trackSpanMinutes(meanMotionRevPerDay) * 60_000;
  const out: Vec3[] = [];
  for (const ti of times(t - span / 2, t + span / 2, n)) {
    const s = propagateAt(satrec, ti);
    if (s.ok) out.push(s.r);
  }
  return out;
}

export interface TrackPoint extends Geodetic {
  readonly t: UnixMs;
}

/**
 * Sub-satellite points from one period before t to one period after (2n segments). Each
 * point is at its own time: the longitude includes the Earth's rotation up to that time.
 */
export function groundTrack(
  satrec: SatRec,
  meanMotionRevPerDay: number,
  t: UnixMs,
  n: number,
): TrackPoint[] {
  const span = trackSpanMinutes(meanMotionRevPerDay) * 60_000;
  const out: TrackPoint[] = [];
  for (const ti of times(t - span, t + span, 2 * n)) {
    const s = propagateAt(satrec, ti);
    if (s.ok) out.push({ t: ti, ...temeToGeodetic(s.r, ti) });
  }
  return out;
}
