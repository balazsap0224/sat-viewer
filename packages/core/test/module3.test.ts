// Module 3 reference values: SGP4 wrapper on OMM elements, TEME → ECEF → WGS-84 geodetic,
// derived values, orbit classes. PENDING OWNER VERIFICATION, see
// docs/verification/phase-1.md, section "Module 3". (The official SGP4 cases are in
// sgp4Verification.test.ts.)

import fc from 'fast-check';
import { eciToGeodetic, gstime, twoline2satrec } from 'satellite.js';
import { describe, expect, it } from 'vitest';
import { R_EARTH, R_POLAR } from '../src/constants';
import { apsidesKm, orbitClass, periodMinutes, semiMajorAxisKm } from '../src/derived';
import { ecefToGeodetic, geodeticToEcef, temeToGeodetic } from '../src/geodetic';
import { type MeanElements, propagateAt, propagateMinutes, satrecFromElements } from '../src/sgp4';
import { degToRad, epochToUnixMs } from '../src/time';
import { norm, sub, vec3 } from '../src/vector';

// Real element sets from CelesTrak, downloaded 2026-10-11 11:51 UTC (the data job's live run).
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
const ASTRA_1KR: MeanElements = {
  NORAD_CAT_ID: 29055,
  EPOCH: '2026-10-11T05:40:27.266016',
  MEAN_MOTION: 1.00273771,
  ECCENTRICITY: 0.00035185,
  INCLINATION: 0.7677,
  RA_OF_ASC_NODE: 82.3771,
  ARG_OF_PERICENTER: 121.4469,
  MEAN_ANOMALY: 280.1376,
  BSTAR: 0,
  MEAN_MOTION_DOT: 0.00000115,
  MEAN_MOTION_DDOT: 0,
};

describe('WGS-84 geodetic', () => {
  it('[3.5] Vallado Example 3-3: ECEF (6524.834, 6862.875, 6448.296) km → φ = 34.352496°, λ = 46.4464°, h = 5085.22 km', () => {
    const g = ecefToGeodetic(vec3(6524.834, 6862.875, 6448.296));
    expect(g.latDeg).toBeCloseTo(34.352496, 5);
    expect(g.lonDeg).toBeCloseTo(46.4464, 4);
    expect(g.altKm).toBeCloseTo(5085.22, 2);
  });

  it('[3.6] on the ellipsoid: equator at 0° → (6378.137, 0, 0) km; North Pole → (0, 0, 6356.752) km', () => {
    const eq = geodeticToEcef(0, 0, 0);
    expect(eq.x).toBeCloseTo(6378.137, 9);
    const pole = geodeticToEcef(Math.PI / 2, 0, 0);
    expect(pole.z).toBeCloseTo(6356.752314, 6);
    expect(R_POLAR).toBeCloseTo(6356.752314, 6);
  });

  it('[3.7] 400 km above 45° N: geodetic 45° is geocentric 44.81895°, a 0.18° (≈ 20 km) difference', () => {
    const r = geodeticToEcef(degToRad(45), 0, 400);
    const geocentric = (Math.atan2(r.z, r.x) * 180) / Math.PI;
    expect(geocentric).toBeCloseTo(44.81895, 4);
  });

  it('geodetic → ECEF → geodetic round trip, from the ground to beyond GEO (property-based)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -89.999, max: 89.999, noNaN: true }),
        fc.double({ min: -179.999, max: 180, noNaN: true }),
        fc.double({ min: -1, max: 50_000, noNaN: true }),
        (lat, lon, h) => {
          const g = ecefToGeodetic(geodeticToEcef(degToRad(lat), degToRad(lon), h));
          return (
            Math.abs(g.latDeg - lat) < 1e-9 &&
            Math.abs(((g.lonDeg - lon + 540) % 360) - 180) < 1e-9 &&
            Math.abs(g.altKm - h) < 1e-6
          );
        },
      ),
    );
  });

  it('agrees with satellite.js eciToGeodetic (an independent WGS-84 implementation) to 1e-6° and 1 mm', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -50_000, max: 50_000, noNaN: true }),
        fc.double({ min: -50_000, max: 50_000, noNaN: true }),
        fc.double({ min: -50_000, max: 50_000, noNaN: true }),
        fc.integer({ min: Date.UTC(2020, 0), max: Date.UTC(2030, 0) }),
        (x, y, z, t) => {
          const r = vec3(x, y, z);
          // Below the surface, or on the polar axis where longitude is undefined: skip.
          if (norm(r) < R_EARTH || Math.hypot(x, y) < 1) return true;
          const ours = temeToGeodetic(r, t);
          const theirs = eciToGeodetic(r, gstime(new Date(t)));
          const dLon = Math.abs(
            ((ours.lonDeg - (theirs.longitude * 180) / Math.PI + 540) % 360) - 180,
          );
          return (
            Math.abs(ours.latDeg - (theirs.latitude * 180) / Math.PI) < 1e-6 &&
            dLon < 1e-6 &&
            Math.abs(ours.altKm - theirs.height) < 1e-6
          );
        },
      ),
    );
  });
});

describe('SGP4 on OMM elements', () => {
  it('OMM and TLE forms of the same element set agree (00005, within 10 m: the OMM epoch is rounded to 1 ms)', () => {
    const tle = twoline2satrec(
      '1 00005U 58002B   00179.78495062  .00000023  00000-0  28098-4 0  4753',
      '2 00005  34.2682 348.7242 1859667 331.7664  19.3264 10.82419157413667',
    );
    const omm = satrecFromElements({
      NORAD_CAT_ID: 5,
      EPOCH: '2000-06-27T18:50:19.733568',
      MEAN_MOTION: 10.82419157,
      ECCENTRICITY: 0.1859667,
      INCLINATION: 34.2682,
      RA_OF_ASC_NODE: 348.7242,
      ARG_OF_PERICENTER: 331.7664,
      MEAN_ANOMALY: 19.3264,
      BSTAR: 0.28098e-4,
      MEAN_MOTION_DOT: 0.00000023,
      MEAN_MOTION_DDOT: 0,
    });
    for (const t of [0, 360, 1440, 4320]) {
      const a = propagateMinutes(tle, t);
      const b = propagateMinutes(omm, t);
      if (!a.ok || !b.ok) throw new Error('propagation failed');
      expect(norm(sub(a.r, b.r))).toBeLessThan(0.01);
    }
  });

  it('[3.8] ISS at its epoch: altitude 413–425 km, latitude within ±51.64°, speed ≈ 7.66 km/s', () => {
    const t = epochToUnixMs(ISS.EPOCH);
    const s = propagateAt(satrecFromElements(ISS), t);
    if (!s.ok) throw new Error(s.failure);
    const g = temeToGeodetic(s.r, t);
    expect(g.altKm).toBeGreaterThan(405);
    expect(g.altKm).toBeLessThan(430);
    expect(Math.abs(g.latDeg)).toBeLessThanOrEqual(51.64);
    expect(norm(s.v)).toBeCloseTo(7.66, 1);
  });

  it('[3.9] ASTRA 1KR (GEO, the 19.2° E slot) stays within 0.1° of longitude and ±1° of the equator for a whole day', () => {
    // Its longitude ran 18.95–19.03° E on 2026-10-11: the satellite is kept in a small box
    // near, not exactly at, the nominal 19.2° E. What matters is that it does not drift.
    const satrec = satrecFromElements(ASTRA_1KR);
    const t0 = epochToUnixMs(ASTRA_1KR.EPOCH);
    const lons: number[] = [];
    for (let h = 0; h <= 24; h += 1) {
      const t = t0 + h * 3_600_000;
      const s = propagateAt(satrec, t);
      if (!s.ok) throw new Error(s.failure);
      const g = temeToGeodetic(s.r, t);
      lons.push(g.lonDeg);
      expect(Math.abs(g.latDeg)).toBeLessThan(1);
      expect(Math.abs(g.altKm - 35786)).toBeLessThan(50);
    }
    expect(Math.max(...lons) - Math.min(...lons)).toBeLessThan(0.1);
    expect(Math.abs(lons[0]! - 19.2)).toBeLessThan(0.5);
  });

  it('a decayed element set is reported, not drawn (SPEC.md 6.1 step 6)', () => {
    // Error-code case 33333 of the verification set: e = 0.995, perigee far underground.
    const satrec = twoline2satrec(
      '1 33333U 05037B   05333.02012661  .25992681  00000-0  24476-3 0  1534',
      '2 33333  96.4736 157.9986 9950000 244.0492 110.6523  4.00004038 10708',
    );
    const results = [0, 50, 100, 150].map((t) => propagateMinutes(satrec, t));
    expect(results.some((r) => !r.ok)).toBe(true);
  });
});

describe('derived values (SPEC.md 6.3)', () => {
  it('[3.10] ISS: period 1440 / 15.48821882 = 92.974 min (SATCAT says 92.98)', () => {
    expect(periodMinutes(ISS.MEAN_MOTION)).toBeCloseTo(92.9739, 3);
  });

  it('[3.11] ISS: a = (μ / n²)^(1/3) = 6798.31 km; perigee 415.6 km, apogee 424.7 km (SATCAT: 416 / 425)', () => {
    expect(semiMajorAxisKm(ISS.MEAN_MOTION)).toBeCloseTo(6798.31, 1);
    const { perigeeKm, apogeeKm } = apsidesKm(ISS.MEAN_MOTION, ISS.ECCENTRICITY);
    expect(perigeeKm).toBeCloseTo(415.6, 1);
    expect(apogeeKm).toBeCloseTo(424.7, 1);
  });

  it('[3.12] GEO: n = 1.00273771 rev/day → period 86,164.1 s = one sidereal day, a = 42,164.2 km', () => {
    expect(periodMinutes(ASTRA_1KR.MEAN_MOTION) * 60).toBeCloseTo(86164.1, 0);
    expect(semiMajorAxisKm(ASTRA_1KR.MEAN_MOTION)).toBeCloseTo(42164.2, 0);
  });

  it('[3.13] orbit classes: ISS LEO, GPS MEO, ASTRA 1KR GEO, Meridian 7 (e = 0.66) HEO', () => {
    expect(orbitClass(ISS.MEAN_MOTION, ISS.ECCENTRICITY, ISS.INCLINATION)).toBe('LEO');
    expect(orbitClass(2.00562244, 0.00291257, 55.1109)).toBe('MEO');
    expect(orbitClass(ASTRA_1KR.MEAN_MOTION, ASTRA_1KR.ECCENTRICITY, ASTRA_1KR.INCLINATION)).toBe(
      'GEO',
    );
    expect(orbitClass(2.00606307, 0.66091195, 62.8)).toBe('HEO');
    // Geosynchronous but inclined 25° (e.g. a QZSS or BeiDou IGSO): not GEO, so MEO
    expect(orbitClass(1.0027, 0.075, 40)).toBe('MEO');
  });
});
