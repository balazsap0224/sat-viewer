// Module 5 reference values: coverage footprint, orbit line, ground track.
// Verified by the owner on 2026-10-12, see docs/verification/phase-2.md, section "Module 5".

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { centralAngle, footprintHalfAngle, smallCircle } from '../src/footprint';
import { type MeanElements, propagateAt, satrecFromElements } from '../src/sgp4';
import { epochToUnixMs, degToRad, radToDeg } from '../src/time';
import { groundTrack, MAX_TRACK_SPAN_MIN, orbitPath, trackSpanMinutes } from '../src/track';
import { norm, sub } from '../src/vector';

// The same ISS elements as module3.test.ts (CelesTrak, 2026-10-11 11:51 UTC).
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
const issSatrec = satrecFromElements(ISS);
const issEpoch = epochToUnixMs(ISS.EPOCH);

describe('footprint (Wertz & Larson 5.2)', () => {
  it('[5.1] ISS at 420 km, horizon: λ = acos(6378.137 / 6798.137) = 20.2455°, edge 2,254 km away', () => {
    const lambda = footprintHalfAngle(420, 0);
    expect(radToDeg(lambda)).toBeCloseTo(20.2455, 3);
    expect(lambda * 6378.137).toBeCloseTo(2253.7, 0);
  });

  it('[5.2] GEO at 35,786 km: λ = 81.30° at the horizon, 71.43° at 10° elevation', () => {
    expect(radToDeg(footprintHalfAngle(35786, 0))).toBeCloseTo(81.2995, 3);
    expect(radToDeg(footprintHalfAngle(35786, degToRad(10)))).toBeCloseTo(71.4327, 3);
  });

  it('is 0 at or below the ground', () => {
    expect(footprintHalfAngle(0, 0)).toBe(0);
    expect(footprintHalfAngle(-5, 0)).toBe(0);
  });

  it('[5.3] small circle around the North Pole: every point at latitude 90° − λ', () => {
    for (const p of smallCircle(Math.PI / 2, 0, degToRad(20), 36)) {
      expect(radToDeg(p.latRad)).toBeCloseTo(70, 9);
    }
  });

  it('small circle: every point is the requested central angle from the centre', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1.5, max: 1.5, noNaN: true }),
        fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
        fc.double({ min: 0.01, max: 1.5, noNaN: true }),
        (lat, lon, angle) => {
          for (const p of smallCircle(lat, lon, angle, 12)) {
            expect(centralAngle(lat, lon, p.latRad, p.lonRad)).toBeCloseTo(angle, 9);
          }
        },
      ),
    );
  });
});

describe('orbit line and ground track (ISS)', () => {
  it('[5.4] the orbit line covers one period and stays at the ISS altitude (405–435 km)', () => {
    const path = orbitPath(issSatrec, ISS.MEAN_MOTION, issEpoch, 360);
    expect(path).toHaveLength(361);
    for (const r of path) {
      const alt = norm(r) - 6378.137;
      expect(alt).toBeGreaterThan(405);
      expect(alt).toBeLessThan(435);
    }
    // After one period the satellite is back near its start: only the orbit's drift (the
    // node moves 0.32° west per orbit, about 38 km) and the Kozai/anomalistic period
    // difference separate the ends.
    expect(norm(sub(path[0]!, path.at(-1)!))).toBeLessThan(60);
  });

  it('the orbit line is centred on the satellite, so the gap between its ends is on the far side', () => {
    const path = orbitPath(issSatrec, ISS.MEAN_MOTION, issEpoch, 360);
    const now = propagateAt(issSatrec, issEpoch);
    if (!now.ok) throw new Error('SGP4 failed');
    expect(norm(sub(path[180]!, now.r))).toBeLessThan(1e-6);
    // Half an orbit away: across the Earth, about 2 × 6,800 km from the satellite.
    expect(norm(sub(path[0]!, now.r))).toBeGreaterThan(13_000);
    expect(norm(sub(path[360]!, now.r))).toBeGreaterThan(13_000);
  });

  it('[5.5] ground track reaches geodetic latitude 51.79° (inclination 51.63° is geocentric)', () => {
    const track = groundTrack(issSatrec, ISS.MEAN_MOTION, issEpoch + 3 * 3_600_000, 2000);
    const maxLat = Math.max(...track.map((p) => p.latDeg));
    const minLat = Math.min(...track.map((p) => p.latDeg));
    expect(maxLat).toBeGreaterThan(51.7);
    expect(maxLat).toBeLessThan(51.85);
    expect(minLat).toBeLessThan(-51.7);
    expect(minLat).toBeGreaterThan(-51.85);
  });

  it('[5.6] successive ascending nodes are 23.61° apart, westward', () => {
    const track = groundTrack(issSatrec, ISS.MEAN_MOTION, issEpoch + 3 * 3_600_000, 2000);
    const nodes: number[] = [];
    for (let i = 1; i < track.length; i++) {
      const a = track[i - 1]!;
      const b = track[i]!;
      if (a.latDeg < 0 && b.latDeg >= 0) {
        let dLon = b.lonDeg - a.lonDeg;
        if (dLon < -180) dLon += 360;
        if (dLon > 180) dLon -= 360;
        nodes.push(a.lonDeg + (-a.latDeg / (b.latDeg - a.latDeg)) * dLon);
      }
    }
    expect(nodes).toHaveLength(2);
    const westward = ((nodes[0]! - nodes[1]! + 540) % 360) - 180;
    expect(westward).toBeCloseTo(23.61, 1);
  });

  it('track span: one period, capped at 2 days for long orbits', () => {
    expect(trackSpanMinutes(ISS.MEAN_MOTION)).toBeCloseTo(92.974, 3);
    expect(trackSpanMinutes(1.00273771)).toBeCloseTo(1436.07, 1);
    expect(trackSpanMinutes(0.07)).toBe(MAX_TRACK_SPAN_MIN);
  });
});
