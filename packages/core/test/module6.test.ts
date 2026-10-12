// Module 6 reference values: look angles, Earth shadow, Sun elevation, pass search.
// PENDING OWNER VERIFICATION, see docs/verification/phase-2.md, section "Module 6".

import fc from 'fast-check';
import { ecfToLookAngles } from 'satellite.js';
import { describe, expect, it } from 'vitest';
import { R_EARTH } from '../src/constants';
import { temeToEcef } from '../src/frames';
import { geodeticToEcef } from '../src/geodetic';
import { isSunlit, lookAngles, lookAnglesEcef, type Observer, sunElevation } from '../src/look';
import { findPasses } from '../src/passes';
import { nextDarkWindow, relativeMagnitude } from '../src/skywatch';
import { type MeanElements, propagateAt, satrecFromElements } from '../src/sgp4';
import { sunDirectionEci } from '../src/sun';
import { degToRad, radToDeg } from '../src/time';
import { vec3 } from '../src/vector';

const atOrigin: Observer = { latRad: 0, lonRad: 0, altKm: 0 };

describe('look angles (Vallado Alg. 27, SEZ frame)', () => {
  // Satellite 1,000 km up, 10° of arc from the observer along the equator.
  const r = R_EARTH + 1000;
  const g = degToRad(10);

  it('[6.1] 10° east along the equator at 1,000 km: elevation 34.7231°, azimuth 90°, range 1,558.80 km', () => {
    const la = lookAnglesEcef(atOrigin, vec3(r * Math.cos(g), r * Math.sin(g), 0));
    expect(radToDeg(la.elRad)).toBeCloseTo(34.7231, 3);
    expect(radToDeg(la.azRad)).toBeCloseTo(90, 9);
    expect(la.rangeKm).toBeCloseTo(1558.8, 1);
  });

  it('[6.2] the same to the north gives azimuth 0°, to the west 270°, to the south 180°', () => {
    expect(
      radToDeg(lookAnglesEcef(atOrigin, vec3(r * Math.cos(g), 0, r * Math.sin(g))).azRad),
    ).toBeCloseTo(0, 9);
    expect(
      radToDeg(lookAnglesEcef(atOrigin, vec3(r * Math.cos(g), -r * Math.sin(g), 0)).azRad),
    ).toBeCloseTo(270, 9);
    expect(
      radToDeg(lookAnglesEcef(atOrigin, vec3(r * Math.cos(g), 0, -r * Math.sin(g))).azRad),
    ).toBeCloseTo(180, 9);
  });

  it('[6.3] 500 km straight up over 45° N (along the WGS-84 normal): elevation 90°, range 500 km', () => {
    const o: Observer = { latRad: degToRad(45), lonRad: degToRad(19), altKm: 0.1 };
    const la = lookAnglesEcef(o, geodeticToEcef(o.latRad, o.lonRad, 500.1));
    expect(radToDeg(la.elRad)).toBeCloseTo(90, 5);
    expect(la.rangeKm).toBeCloseTo(500, 6);
  });

  it('agrees with satellite.js ecfToLookAngles (an independent implementation)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1.5, max: 1.5, noNaN: true }),
        fc.double({ min: -3.1, max: 3.1, noNaN: true }),
        fc.double({ min: -42000, max: 42000, noNaN: true }),
        fc.double({ min: -42000, max: 42000, noNaN: true }),
        fc.double({ min: -42000, max: 42000, noNaN: true }),
        (lat, lon, x, y, z) => {
          fc.pre(Math.hypot(x, y, z) > 6600);
          const ours = lookAnglesEcef({ latRad: lat, lonRad: lon, altKm: 0.2 }, vec3(x, y, z));
          const theirs = ecfToLookAngles(
            { latitude: lat, longitude: lon, height: 0.2 },
            { x, y, z },
          );
          // Compared as sin(el): near 90° asin magnifies rounding (an input error of 1e-16
          // becomes ~1.5e-8 rad), so the angles themselves can differ by more than 1e-9.
          expect(Math.sin(ours.elRad)).toBeCloseTo(Math.sin(theirs.elevation), 9);
          expect(ours.rangeKm).toBeCloseTo(theirs.rangeSat, 6);
          // Azimuth is undefined straight overhead; compare elsewhere, modulo 2π.
          if (Math.abs(ours.elRad) < 1.55) {
            const d = Math.abs(ours.azRad - theirs.azimuth) % (2 * Math.PI);
            expect(Math.min(d, 2 * Math.PI - d)).toBeLessThan(1e-9);
          }
        },
      ),
    );
  });
});

describe('Earth shadow (cylinder) and Sun elevation', () => {
  const sun = vec3(1, 0, 0);

  it('[6.4] shadow: directly behind the Earth at 7,000 km is dark; beside the cylinder or on the day side is lit', () => {
    expect(isSunlit(vec3(-7000, 0, 0), sun)).toBe(false);
    expect(isSunlit(vec3(-7000, 6000, 0), sun)).toBe(false); // 6,000 km from the axis < R
    expect(isSunlit(vec3(-7000, 6400, 0), sun)).toBe(true); // 6,400 km > R = 6,378 km
    expect(isSunlit(vec3(-7000, 0, 7000), sun)).toBe(true);
    expect(isSunlit(vec3(7000, 0, 0), sun)).toBe(true);
    expect(isSunlit(vec3(-42164, 0, 0), sun)).toBe(false); // GEO at an equinox midnight
  });

  // Equinox 2026-03-20 12:00 UTC: the Sun is over the equator at about 1.9° E (module 1, [1.7]).
  const t = Date.UTC(2026, 2, 20, 12);

  it('[6.5] equinox noon: Sun elevation ≈ 90° at (0°, 1.9° E), ≈ 60° at (30° N, 1.9° E), ≈ 0° at (0°, 91.9° E)', () => {
    const el = (latDeg: number, lonDeg: number) =>
      radToDeg(sunElevation({ latRad: degToRad(latDeg), lonRad: degToRad(lonDeg), altKm: 0 }, t));
    expect(el(0, 1.9)).toBeGreaterThan(89.5);
    expect(el(30, 1.9)).toBeCloseTo(60, 0);
    expect(Math.abs(el(0, 91.9))).toBeLessThan(0.5);
  });

  it('Sun elevation is exactly 90° where the WGS-84 normal points at the Sun', () => {
    const s = temeToEcef(sunDirectionEci(t), t);
    const o = { latRad: Math.asin(s.z), lonRad: Math.atan2(s.y, s.x), altKm: 0 };
    expect(radToDeg(sunElevation(o, t))).toBeCloseTo(90, 6);
  });
});

describe('pass search', () => {
  // The same ISS elements as module3.test.ts; observer in Budapest.
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
  const satrec = satrecFromElements(ISS);
  const budapest: Observer = { latRad: degToRad(47.4979), lonRad: degToRad(19.0402), altKm: 0.1 };
  const from = Date.UTC(2026, 9, 11);
  const to = from + 2 * 86_400_000;
  const passes = findPasses(satrec, budapest, from, to, { maxPasses: 50 });

  it('[6.6] matches a brute-force scan every second: same passes, rise/set within 1.5 s, peak within 0.01°', () => {
    const threshold = degToRad(10);
    const scan: { rise: number; set: number; max: number }[] = [];
    let prev = -Math.PI;
    let open: { rise: number; max: number } | undefined;
    for (let t = from; t <= to; t += 1000) {
      const s = propagateAt(satrec, t);
      const el = s.ok ? lookAngles(budapest, s.r, t).elRad : -Math.PI;
      if (el >= threshold && prev < threshold) open = { rise: t, max: el };
      if (open && el > open.max) open.max = el;
      if (el < threshold && prev >= threshold && open) {
        scan.push({ ...open, set: t });
        open = undefined;
      }
      prev = el;
    }
    expect(passes).toHaveLength(scan.length);
    expect(passes.length).toBeGreaterThanOrEqual(8);
    passes.forEach((p, i) => {
      expect(Math.abs(p.rise.t - scan[i]!.rise)).toBeLessThan(1500);
      expect(Math.abs(p.set.t - scan[i]!.set)).toBeLessThan(1500);
      expect(Math.abs(radToDeg(p.culmination.elRad - scan[i]!.max))).toBeLessThan(0.01);
      expect(radToDeg(p.rise.elRad)).toBeCloseTo(10, 2);
      expect(radToDeg(p.set.elRad)).toBeCloseTo(10, 2);
    });
  });

  it('[6.7] a GEO satellite seen from Budapest is up all the time: one pass covering the window', () => {
    const astra = satrecFromElements({
      NORAD_CAT_ID: 29055,
      EPOCH: '2026-10-11T05:40:27.266016',
      MEAN_MOTION: 1.00273771,
      ECCENTRICITY: 0.00035185,
      INCLINATION: 0.7677,
      RA_OF_ASC_NODE: 82.3771,
      ARG_OF_PERICENTER: 121.4469,
      MEAN_ANOMALY: 280.1376,
      BSTAR: 0,
      MEAN_MOTION_DOT: 0,
      MEAN_MOTION_DDOT: 0,
    });
    const p = findPasses(astra, budapest, from, to);
    expect(p).toHaveLength(1);
    expect(p[0]!.startsBeforeWindow && p[0]!.endsAfterWindow).toBe(true);
    // Elevation of a GEO satellite at nearly the same longitude, seen from 47.5° N: about 35°.
    expect(radToDeg(p[0]!.culmination.elRad)).toBeGreaterThan(34);
    expect(radToDeg(p[0]!.culmination.elRad)).toBeLessThan(36.5);
  });

  it('a visible part, if any, lies inside its pass', () => {
    for (const p of passes) {
      if (!p.visible) continue;
      expect(p.visible.from).toBeGreaterThanOrEqual(p.rise.t);
      expect(p.visible.to).toBeLessThanOrEqual(p.set.t);
    }
  });
});

describe('dark sky window and relative brightness (skywatch.ts)', () => {
  const budapest: Observer = { latRad: degToRad(47.4979), lonRad: degToRad(19.0402), altKm: 0.1 };

  it('[6.8] Budapest, from 12 Oct 2026 12:00 UTC: dark (Sun below −6°) from 16:32:46 to 04:28:27 UTC', () => {
    const w = nextDarkWindow(budapest, Date.UTC(2026, 9, 12, 12), Date.UTC(2026, 9, 13, 12));
    expect(w).not.toBeNull();
    expect(Math.abs(w!.from - Date.UTC(2026, 9, 12, 16, 32, 46))).toBeLessThan(5000);
    expect(Math.abs(w!.to - Date.UTC(2026, 9, 13, 4, 28, 27))).toBeLessThan(5000);
    expect(radToDeg(sunElevation(budapest, w!.from))).toBeCloseTo(-6, 2);
  });

  it('[6.9] Longyearbyen (78.2° N) at midsummer: no dark sky at all; starting at night: the window starts at once', () => {
    const svalbard: Observer = { latRad: degToRad(78.22), lonRad: degToRad(15.65), altKm: 0 };
    expect(nextDarkWindow(svalbard, Date.UTC(2026, 5, 21), Date.UTC(2026, 5, 22))).toBeNull();
    const night = Date.UTC(2026, 9, 12, 22);
    expect(nextDarkWindow(budapest, night, night + 86_400_000)!.from).toBe(night);
  });

  it('[6.10] relative brightness: 20,000 kg at 500 km is 3.67 mag brighter than 1,000 kg at 1,000 km', () => {
    expect(relativeMagnitude(1000, 1000)).toBeCloseTo(-5, 9);
    expect(relativeMagnitude(20000, 500)).toBeCloseTo(-8.6735, 4);
  });
});
