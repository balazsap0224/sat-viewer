// The interpolation between SGP4 samples stays within 1 km of SGP4 itself (SPEC.md 7.3).

import {
  type MeanElements,
  norm,
  propagateAt,
  satrecFromElements,
  sub,
  type Vec3,
  vec3,
  epochToUnixMs,
} from '@sat-viewer/core';
import { describe, expect, it } from 'vitest';
import { hermite, SAMPLE_STEP_S } from './hermite';

const ISS: MeanElements = {
  NORAD_CAT_ID: 25544,
  EPOCH: '2026-10-11T04:13:59.875680',
  MEAN_MOTION: 15.48821882,
  ECCENTRICITY: 0.00067135,
  INCLINATION: 51.6312,
  RA_OF_ASC_NODE: 86.0933,
  ARG_OF_PERICENTER: 248.1316,
  MEAN_ANOMALY: 111.8959,
  BSTAR: 0.0001801405,
  MEAN_MOTION_DOT: 0.0000943,
  MEAN_MOTION_DDOT: 0,
};

/** Meridian 7: Molniya orbit, e = 0.66, the fastest perigee pass among the active objects */
const MOLNIYA: MeanElements = {
  NORAD_CAT_ID: 1,
  EPOCH: '2026-10-11T00:00:00',
  MEAN_MOTION: 2.00606307,
  ECCENTRICITY: 0.66091195,
  INCLINATION: 62.8,
  RA_OF_ASC_NODE: 100,
  ARG_OF_PERICENTER: 270,
  MEAN_ANOMALY: 0, // start at perigee, the worst place
  BSTAR: 0,
  MEAN_MOTION_DOT: 0,
  MEAN_MOTION_DDOT: 0,
};

/** Largest distance [km] between the Hermite curve and SGP4 over a day of steps. */
function worstError(el: MeanElements): number {
  const satrec = satrecFromElements(el);
  const t0 = epochToUnixMs(el.EPOCH);
  const h = SAMPLE_STEP_S;
  const at = (t: number) => {
    const s = propagateAt(satrec, t);
    if (!s.ok) throw new Error(s.failure);
    return s;
  };
  let worst = 0;
  for (let k = 0; k < 86400 / h; k++) {
    const tA = t0 + k * h * 1000;
    const A = at(tA);
    const B = at(tA + h * 1000);
    for (const u of [0.25, 0.5, 0.75]) {
      const truth = at(tA + u * h * 1000).r;
      const c = (f: (v: Vec3) => number) => hermite(f(A.r), f(A.v), f(B.r), f(B.v), h, u);
      const p = vec3(
        c((v) => v.x),
        c((v) => v.y),
        c((v) => v.z),
      );
      worst = Math.max(worst, norm(sub(p, truth)));
    }
  }
  return worst;
}

describe('Hermite interpolation between samples 240 s apart', () => {
  it('ISS (LEO): within 0.5 km of SGP4 over a whole day', () => {
    expect(worstError(ISS)).toBeLessThan(0.5);
  });

  it('Molniya (e = 0.66, fastest at perigee): within 1 km of SGP4 over a whole day', () => {
    expect(worstError(MOLNIYA)).toBeLessThan(1);
  });

  it('passes exactly through both samples', () => {
    expect(hermite(1, 5, 2, -3, 240, 0)).toBe(1);
    expect(hermite(1, 5, 2, -3, 240, 1)).toBeCloseTo(2, 12);
  });
});
