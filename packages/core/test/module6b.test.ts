// Module 6b reference values: close approaches ("closest meetings").
// PENDING OWNER VERIFICATION, see docs/verification/phase-2.md, section "Module 6b".

import { describe, expect, it } from 'vitest';
import { MU_EARTH, R_EARTH } from '../src/constants';
import { findEncounters, linearClosestApproach } from '../src/encounters';
import { propagateAt, type SatRec, satrecFromElements } from '../src/sgp4';
import { norm, sub, vec3 } from '../src/vector';

/** Mean motion [rev/day] of a circular orbit at altitude h [km] (Kepler's third law). */
const revPerDay = (h: number) => (Math.sqrt(MU_EARTH / (R_EARTH + h) ** 3) * 86400) / (2 * Math.PI);

const EPOCH = '2026-10-12T00:00:00.000000';
const T0 = Date.UTC(2026, 9, 12);

function circular(id: number, h: number, incl: number, raan: number, ma: number): SatRec {
  return satrecFromElements({
    NORAD_CAT_ID: id,
    EPOCH,
    MEAN_MOTION: revPerDay(h),
    ECCENTRICITY: 0.0001,
    INCLINATION: incl,
    RA_OF_ASC_NODE: raan,
    ARG_OF_PERICENTER: 0,
    MEAN_ANOMALY: ma,
    BSTAR: 0,
    MEAN_MOTION_DOT: 0,
    MEAN_MOTION_DDOT: 0,
  });
}

describe('closest approach of straight-line motion', () => {
  it('[6b.1] dr = (10, 0, 0) km, dv = (−1, 1, 0) km/s: closest after τ = 5 s, at 7.0711 km', () => {
    const r = linearClosestApproach(vec3(10, 0, 0), vec3(-1, 1, 0), 60);
    expect(r.tau).toBeCloseTo(5, 12);
    expect(r.distKm).toBeCloseTo(Math.sqrt(50), 12);
  });

  it('[6b.2] the same, but only ±2 s allowed: τ = 2 s, distance √68 = 8.2462 km', () => {
    const r = linearClosestApproach(vec3(10, 0, 0), vec3(-1, 1, 0), 2);
    expect(r.tau).toBe(2);
    expect(r.distKm).toBeCloseTo(Math.sqrt(68), 12);
  });
});

describe('close-approach screening', () => {
  it('[6b.3] equatorial and polar orbits at 500 km meeting over the node: relative speed ≈ v·√2 = 10.77 km/s', () => {
    // Both start at the ascending node (RAAN 0, argument of perigee 0, mean anomaly 0) at the
    // epoch, so they meet there; SGP4's J2 terms put them a few km apart, not at 0.
    const objs = [
      { id: 1, satrec: circular(1, 500, 0, 0, 0) },
      { id: 2, satrec: circular(2, 500, 90, 0, 0) },
    ];
    const found = findEncounters(objs, T0 - 600_000, T0 + 600_000, { thresholdKm: 30 });
    expect(found).toHaveLength(1);
    const e = found[0]!;
    expect(Math.abs(e.t - T0)).toBeLessThan(5_000);
    expect(e.missKm).toBeLessThan(30);
    // v = √(μ / r) = √(398600.4418 / 6878.137) = 7.6126 km/s; at 90° apart: v·√2 = 10.766.
    // SGP4's mean-to-osculating terms change the speeds by a few m/s.
    expect(e.relSpeedKmS).toBeGreaterThan(10.6);
    expect(e.relSpeedKmS).toBeLessThan(10.9);
  });

  it('[6b.4] finds the same approaches as a brute-force scan of every pair every second (30 objects, 3 h)', () => {
    // A reproducible random set of LEO orbits in one 20 km shell (lots of crossings).
    let seed = 12345;
    const rand = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const objs = Array.from({ length: 30 }, (_, k) => ({
      id: k + 1,
      satrec: circular(k + 1, 500 + 20 * rand(), 40 + 60 * rand(), 360 * rand(), 360 * rand()),
    }));
    const from = T0;
    const to = T0 + 3 * 3_600_000;
    const threshold = 50;
    const found = findEncounters(objs, from, to, { thresholdKm: threshold });

    // Brute force: positions every 1 s, every pair; each local minimum refined by a 1 ms scan.
    const n = objs.length;
    const steps = (to - from) / 1000;
    const pos = objs.map((o) =>
      Array.from({ length: steps + 1 }, (_, s) => {
        const st = propagateAt(o.satrec, from + s * 1000);
        if (!st.ok) throw new Error('SGP4 failed');
        return st.r;
      }),
    );
    const brute: { a: number; b: number; t: number; miss: number; rel: number }[] = [];
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const d = (s: number) => norm(sub(pos[i]![s]!, pos[j]![s]!));
        for (let s = 1; s < steps; s++) {
          if (!(d(s) <= d(s - 1) && d(s) < d(s + 1)) || d(s) > threshold + 20) continue;
          let best = { t: 0, miss: Infinity };
          for (let t = from + (s - 1) * 1000; t <= from + (s + 1) * 1000; t += 1) {
            const a = propagateAt(objs[i]!.satrec, t);
            const b = propagateAt(objs[j]!.satrec, t);
            if (!a.ok || !b.ok) continue;
            const m = norm(sub(a.r, b.r));
            if (m < best.miss) best = { t, miss: m };
          }
          const a = propagateAt(objs[i]!.satrec, best.t);
          const b = propagateAt(objs[j]!.satrec, best.t);
          if (!a.ok || !b.ok) continue;
          const rel = norm(sub(a.v, b.v));
          if (best.miss <= threshold && rel >= 0.5)
            brute.push({ a: i + 1, b: j + 1, t: best.t, miss: best.miss, rel });
        }
      }

    expect(brute.length).toBeGreaterThanOrEqual(10);
    expect(found).toHaveLength(brute.length);
    for (const b of brute) {
      const f = found.find((e) => e.a === b.a && e.b === b.b && Math.abs(e.t - b.t) < 50);
      expect(f, `approach ${b.a}–${b.b} at ${new Date(b.t).toISOString()}`).toBeDefined();
      expect(Math.abs(f!.missKm - b.miss)).toBeLessThan(0.005);
      expect(Math.abs(f!.relSpeedKmS - b.rel)).toBeLessThan(0.001);
    }
  }, 60_000);

  it('pairs moving together are left out (relative speed below 0.5 km/s)', () => {
    // Same orbit, 0.01° apart in mean anomaly: about 1.2 km apart, all the time.
    const objs = [
      { id: 1, satrec: circular(1, 500, 51.6, 10, 0) },
      { id: 2, satrec: circular(2, 500, 51.6, 10, 0.01) },
    ];
    expect(findEncounters(objs, T0, T0 + 3_600_000, { thresholdKm: 10 })).toEqual([]);
  });
});
