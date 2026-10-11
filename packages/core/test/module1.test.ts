// Module 1 reference values: time, Earth rotation (GMST), Sun direction.
// Verified by the owner on 2026-10-11, see docs/verification/phase-1.md, section "Module 1".

import fc from 'fast-check';
import { gstime } from 'satellite.js';
import { describe, expect, it } from 'vitest';
import { SIDEREAL_DAY_S } from '../src/constants';
import { ecefToTeme, gmst, temeToEcef } from '../src/frames';
import { sunDirectionEci } from '../src/sun';
import { julianDate, radToDeg } from '../src/time';
import { norm, sub, vec3 } from '../src/vector';

const DEG = 180 / Math.PI;

describe('time', () => {
  it('[1.1] the Unix epoch is JD 2440587.5 and J2000.0 (2000-01-01 12:00) is JD 2451545.0', () => {
    expect(julianDate(0)).toBe(2440587.5);
    expect(julianDate(Date.UTC(2000, 0, 1, 12))).toBe(2451545.0);
  });
});

describe('Greenwich Mean Sidereal Time (IAU-1982)', () => {
  it('[1.2] at J2000.0 (2000-01-01 12:00 UT) GMST = 280.46061837°', () => {
    expect(radToDeg(gmst(Date.UTC(2000, 0, 1, 12)))).toBeCloseTo(280.46061837, 6);
  });

  it('[1.3] Vallado Example 3-5: 1992-08-20 12:14:00 UT1 → GMST = 152.578788°', () => {
    expect(radToDeg(gmst(Date.UTC(1992, 7, 20, 12, 14)))).toBeCloseTo(152.578788, 5);
  });

  it('[1.4] after one sidereal day (86,164.09 s) GMST is back to the same angle (±0.001°)', () => {
    const t0 = Date.UTC(2026, 9, 11);
    const diff = Math.abs(gmst(t0 + SIDEREAL_DAY_S * 1000) - gmst(t0)) * DEG;
    expect(Math.min(diff, 360 - diff)).toBeLessThan(0.001);
  });

  it('agrees with satellite.js gstime (an independent implementation) to 1e-8 rad (6 cm at the surface; the two compute the Julian date differently, so they differ by rounding)', () => {
    fc.assert(
      fc.property(fc.integer({ min: Date.UTC(1980, 0), max: Date.UTC(2060, 0) }), (t) => {
        const d = Math.abs(gmst(t) - gstime(new Date(t)));
        return Math.min(d, 2 * Math.PI - d) < 1e-8;
      }),
    );
  });

  it('TEME → ECEF → TEME round trip (property-based)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -5e4, max: 5e4, noNaN: true }),
        fc.double({ min: -5e4, max: 5e4, noNaN: true }),
        fc.double({ min: -5e4, max: 5e4, noNaN: true }),
        fc.integer({ min: Date.UTC(2000, 0), max: Date.UTC(2050, 0) }),
        (x, y, z, t) => {
          const r = vec3(x, y, z);
          return norm(sub(ecefToTeme(temeToEcef(r, t), t), r)) < 1e-8 * Math.max(1, norm(r));
        },
      ),
    );
  });
});

describe('Sun direction', () => {
  const declination = (t: number) => Math.asin(sunDirectionEci(t).z) * DEG;

  it('[1.5] June solstice 2026-06-21 08:24 UTC: declination ≈ +23.44°', () => {
    expect(declination(Date.UTC(2026, 5, 21, 8, 24))).toBeCloseTo(23.44, 1);
  });

  it('[1.6] March equinox 2026-03-20 14:46 UTC: declination ≈ 0° (±0.02°)', () => {
    expect(Math.abs(declination(Date.UTC(2026, 2, 20, 14, 46)))).toBeLessThan(0.02);
  });

  it('[1.7] subsolar longitude at 12:00 UTC on the equinox ≈ +1.9° E (equation of time ≈ −7.5 min: solar noon at Greenwich is at 12:07:30, so at 12:00 the Sun is still east)', () => {
    const t = Date.UTC(2026, 2, 20, 12);
    const s = temeToEcef(sunDirectionEci(t), t);
    expect(Math.atan2(s.y, s.x) * DEG).toBeCloseTo(1.9, 0);
  });
});
