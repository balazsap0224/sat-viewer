// SGP4 against the official verification set (SPEC.md 6.5): Vallado, Crawford, Hujsak and
// Kelso, "Revisiting Spacetrack Report #3", AIAA 2006-6753. Test cases SGP4-VER.TLE with
// the expected TEME positions and velocities of the reference implementations. Files from
// https://celestrak.org/publications/AIAA/2006-6753/ (AIAA-2006-6753.zip, downloaded once on
// 2026-10-11), copied unchanged into fixtures/:
//   tmatverDec2015.out   MATLAB reference, December 2015 (the main reference here)
//   java_sgp4_ver.out    Java reference (used for case 23599, see below)
//
// This checks that satellite.js is used correctly: time argument, units, frame.
// Verified by the owner on 2026-10-11 (the hand-checked values are in
// docs/verification/phase-1.md, module 3).
//
// Three things about the reference files, found while writing this test (2026-10-11):
// 1. Case 23599 (ARIANE 42P+3 R/B) is in the set *because* implementations differ there: its
//    comment says "Lyddane bug at > 280.5 min for AcTan()". The MATLAB 2015 output differs
//    from the Java output by up to 0.96 km between 420 and 720 min. satellite.js matches the
//    Java output to all printed digits (1e-8 km), so 23599 is checked against Java.
// 2. Case 33334 is an error-code test ("try and check error code 2"): the reference prints
//    t = 0 and then stops with an error. satellite.js already reports the error at t = 0. The
//    test checks that SGP4 refuses this element set, which is what matters (SPEC.md 6.1
//    step 6: such objects are hidden, never drawn at a wrong place).
// 3. The last block of the MATLAB file (20413 again) ends in a malformed line where many
//    records of another object run together without line breaks, at times outside the
//    range the TLE asks for. Only rows at t = 0 or inside the TLE's start..stop range are
//    used (the range is written after column 69 of line 2).

import { readFileSync } from 'node:fs';
import { twoline2satrec } from 'satellite.js';
import { describe, expect, it } from 'vitest';
import { propagateMinutes } from '../src/sgp4';
import { norm, sub, vec3 } from '../src/vector';

const lines = (name: string) =>
  readFileSync(new URL(`fixtures/${name}`, import.meta.url), 'utf8').split(/\r?\n/);

interface Expected {
  readonly t: number;
  readonly r: [number, number, number];
  readonly v: [number, number, number];
}

interface Case {
  readonly satnum: number;
  readonly line1: string;
  readonly line2: string;
  readonly expected: Expected[];
}

/** Reads one reference output: "<satnum> xx" blocks of "t x y z vx vy vz …" rows. */
function readOutput(name: string): { satnum: number; rows: number[][] }[] {
  const blocks: { satnum: number; rows: number[][] }[] = [];
  for (const line of lines(name)) {
    const head = /^\s*(\d+)\s+xx/.exec(line);
    if (head) blocks.push({ satnum: Number(head[1]), rows: [] });
    else if (line.trim() !== '') blocks.at(-1)?.rows.push(line.trim().split(/\s+/).map(Number));
  }
  return blocks;
}

/** Pairs the TLEs (in file order) with the blocks of a reference output. */
function loadCases(outputFile: string): Case[] {
  const tle = lines('SGP4-VER.TLE').filter((l) => !l.startsWith('#') && l.trim() !== '');
  return readOutput(outputFile).map((b, i) => {
    const line1 = tle[2 * i] ?? '';
    const line2 = tle[2 * i + 1] ?? '';
    if (Number(line1.slice(2, 7)) !== b.satnum) throw new Error(`file order differs at ${i}`);
    const [start = 0, stop = 0] = line2.slice(69).trim().split(/\s+/).map(Number);
    const inRange = (t: number) =>
      t === 0 || (t >= Math.min(start, stop) && t <= Math.max(start, stop));
    return {
      satnum: b.satnum,
      line1,
      // Columns past 69 hold the test's start/stop/step times, not part of a real TLE.
      line2: line2.slice(0, 69),
      expected: b.rows
        .filter((r) => r.length >= 7 && inRange(r[0] ?? NaN))
        .map((r) => ({
          t: r[0] ?? NaN,
          r: [r[1] ?? NaN, r[2] ?? NaN, r[3] ?? NaN],
          v: [r[4] ?? NaN, r[5] ?? NaN, r[6] ?? NaN],
        })),
    };
  });
}

const matlab = loadCases('tmatverDec2015.out');
const java = loadCases('java_sgp4_ver.out');
/** Cases checked against the Java reference instead of MATLAB (see note 1 above) */
const USE_JAVA = new Set([23599]);
/** Cases that must be refused by SGP4 (see note 2 above) */
const MUST_FAIL = new Set([33334]);

const reference = (i: number): Case => {
  const m = matlab[i]!;
  return USE_JAVA.has(m.satnum) ? java[i]! : m;
};

/** Largest position [km] and velocity [km/s] error over all expected rows of a case. */
function worstError(c: Case): { r: number; v: number; rows: number } {
  const satrec = twoline2satrec(c.line1, c.line2);
  let r = 0;
  let v = 0;
  for (const e of c.expected) {
    const s = propagateMinutes(satrec, e.t);
    if (!s.ok) throw new Error(`case ${c.satnum}, t = ${e.t} min: ${s.failure}`);
    r = Math.max(r, norm(sub(s.r, vec3(...e.r))));
    v = Math.max(v, norm(sub(s.v, vec3(...e.v))));
  }
  return { r, v, rows: c.expected.length };
}

describe('SGP4 verification set (AIAA 2006-6753)', () => {
  it('has all 33 cases in both reference outputs, in the same order', () => {
    expect(matlab).toHaveLength(33);
    expect(java.map((c) => c.satnum)).toEqual(matlab.map((c) => c.satnum));
  });

  const checked = matlab.map((c, i) => [c.satnum, i] as const).filter(([n]) => !MUST_FAIL.has(n));

  it.each(checked)(
    'case %i: every expected TEME position within 1 m and velocity within 1 mm/s',
    (_, i) => {
      const w = worstError(reference(i));
      expect(w.rows).toBeGreaterThan(0);
      expect(w.r).toBeLessThan(1e-3); // km
      expect(w.v).toBeLessThan(1e-6); // km/s
    },
  );

  it('case 33334 (error-code test): SGP4 refuses the element set', () => {
    const c = matlab.find((x) => x.satnum === 33334)!;
    expect(propagateMinutes(twoline2satrec(c.line1, c.line2), 0).ok).toBe(false);
  });

  it('case 23599: the two references differ by up to ~1 km, satellite.js matches Java', () => {
    const i = matlab.findIndex((x) => x.satnum === 23599);
    expect(worstError(java[i]!).r).toBeLessThan(1e-6);
    expect(worstError(matlab[i]!).r).toBeGreaterThan(0.5);
  });
});

describe('hand-checked values (docs/verification/phase-1.md, module 3)', () => {
  const at = (satnum: number, t: number) => {
    const c = matlab.find((x) => x.satnum === satnum);
    if (!c) throw new Error(`no case ${satnum}`);
    const s = propagateMinutes(twoline2satrec(c.line1, c.line2), t);
    if (!s.ok) throw new Error(s.failure);
    return s;
  };

  it('[3.1] 00005 (Vanguard 1, near-Earth, e = 0.186) at t = 0: r = (7022.46529266, −1400.08296755, 0.03995155) km', () => {
    const { r } = at(5, 0);
    expect(r.x).toBeCloseTo(7022.46529266, 6);
    expect(r.y).toBeCloseTo(-1400.08296755, 6);
    expect(r.z).toBeCloseTo(0.03995155, 6);
  });

  it('[3.2] 00005 at t = 360 min: r = (−7154.03120202, −3783.17682504, −3536.19412294) km', () => {
    const { r } = at(5, 360);
    expect(r.x).toBeCloseTo(-7154.03120202, 6);
    expect(r.y).toBeCloseTo(-3783.17682504, 6);
    expect(r.z).toBeCloseTo(-3536.19412294, 6);
  });

  it('[3.3] 08195 (Molniya 2-14, deep space, 12 h resonant) at t = 2880 min matches the reference row', () => {
    const c = matlab.find((x) => x.satnum === 8195)!;
    const e = c.expected.find((x) => x.t === 2880)!;
    expect(norm(sub(at(8195, 2880).r, vec3(...e.r)))).toBeLessThan(1e-3);
  });

  it('[3.4] 28626 (geostationary, 24 h resonant): radius stays ≈ 42,164 km over the test span', () => {
    const c = matlab.find((x) => x.satnum === 28626)!;
    for (const e of c.expected) {
      const radius = norm(at(28626, e.t).r);
      expect(radius).toBeGreaterThan(42_100);
      expect(radius).toBeLessThan(42_230);
    }
  });
});
