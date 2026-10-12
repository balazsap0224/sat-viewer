// Close approaches between satellites ("closest meetings", SPEC.md 7.2), from public orbit
// data and SGP4.
//
// Comparing every pair at every moment is far too much work (16,700 objects are 140 million
// pairs), so the search works in three stages, each cheaper than checking everything:
//
//   1. Sample every object with SGP4 every 240 s, and fill in positions and velocities every
//      `stepS` (10 s) with the cubic Hermite curve through the samples (hermite.ts, error
//      under 0.1 km).
//   2. At each step, put every object into a grid of cubes `R` km wide and compare only
//      objects in the same or neighbouring cubes. R is chosen so that no pair can get within
//      the threshold during the step unless it starts within R of each other:
//        R = threshold + (largest relative speed) · stepS / 2 + small pads
//      For each nearby pair, assume straight-line relative motion during the step
//      (dr = relative position, dv = relative velocity, both at the step's time):
//        closest time τ = −(dr · dv) / |dv|²   (clamped to ± stepS / 2)
//        distance       = |dr + dv τ|
//   3. Pairs that come within the threshold (plus a margin) go back to exact SGP4: the
//      distance is minimised by golden-section search to 1 ms, which gives the time of
//      closest approach (TCA), the miss distance and the relative speed there.
//
// Two filters keep the list about meetings rather than neighbours:
//   - relative speed at least `minRelSpeedKmS` (default 0.5 km/s): objects that drift along
//     together (ISS modules with their own catalog numbers, formation flyers such as
//     TerraSAR-X and TanDEM-X, satellites sharing a geostationary slot, a fresh Starlink
//     train) are close all the time, not meeting;
//   - one encounter per pair per pass: repeated checks of the same approach are merged.
//
// Accuracy: the orbit data is good to about 1 km near its epoch and drifts by a few km per day
// (docs/orbit-notes.md), so a miss distance under a few km means "very close", not a number to
// trust to the metre. Real collision screening uses better orbits and their uncertainties.

import { hermiteRateWeights, hermiteWeights } from './hermite';
import { propagateAt, type SatRec } from './sgp4';
import type { UnixMs } from './time';
import { norm, sub, type Vec3 } from './vector';

export interface EncounterOptions {
  /** Report approaches closer than this [km] (default 10) */
  readonly thresholdKm?: number;
  /** Ignore pairs moving slower than this relative to each other [km/s] (default 0.5) */
  readonly minRelSpeedKmS?: number;
  /** Fine step [s] (default 10) */
  readonly stepS?: number;
  /** Called now and then with the fraction done, 0..1 */
  readonly onProgress?: (done: number) => void;
}

export interface EncounterObject {
  readonly id: number;
  readonly satrec: SatRec;
  /** Pairs of two passive objects are not screened (e.g. two debris fragments) */
  readonly passive?: boolean;
}

export interface Encounter {
  /** The two objects' ids, a < b */
  readonly a: number;
  readonly b: number;
  /** Time of closest approach */
  readonly t: UnixMs;
  readonly missKm: number;
  readonly relSpeedKmS: number;
}

/** SGP4 sample spacing [s]; Hermite error stays under 0.1 km at this spacing (hermite.ts) */
const SAMPLE_STEP_S = 240;
/**
 * Largest relative speed screened for [km/s]: two LEO objects head-on is about 15.5 km/s; a
 * highly elliptical orbit at perigee (~10 km/s) against a LEO object is up to about 17.6.
 */
export const MAX_REL_SPEED_KMS = 18;
/**
 * Straight-line motion over half a step misses the curve by ½·a·t² per object, with gravity
 * a ≤ 0.0095 km/s² in LEO: 0.12 km for 5 s; both objects, plus the Hermite error (0.1 km
 * each), stay under 0.5 km. The pad is generous.
 */
const PAD_KM = 1;
/** Hash table size: about twice the number of objects keeps buckets short */
const HASH_BITS = 15;

/**
 * Closest approach of two points moving in straight lines with relative position dr and
 * relative velocity dv, within |τ| ≤ maxTau: τ = −(dr · dv)/|dv|², distance |dr + dv τ|.
 */
export function linearClosestApproach(
  dr: Vec3,
  dv: Vec3,
  maxTau: number,
): { readonly tau: number; readonly distKm: number } {
  const vv = dv.x * dv.x + dv.y * dv.y + dv.z * dv.z;
  let tau = vv > 0 ? -(dr.x * dv.x + dr.y * dv.y + dr.z * dv.z) / vv : 0;
  tau = Math.max(-maxTau, Math.min(maxTau, tau));
  const x = dr.x + dv.x * tau;
  const y = dr.y + dv.y * tau;
  const z = dr.z + dv.z * tau;
  return { tau, distKm: Math.sqrt(x * x + y * y + z * z) };
}

/** Distance between two objects at t [km], or NaN where SGP4 fails. */
function distanceAt(a: SatRec, b: SatRec, t: number): number {
  const sa = propagateAt(a, t);
  const sb = propagateAt(b, t);
  return sa.ok && sb.ok ? norm(sub(sa.r, sb.r)) : NaN;
}

/** Time of the smallest distance in [lo, hi] [ms], golden-section search to 1 ms. */
function refine(a: SatRec, b: SatRec, lo: number, hi: number): number {
  const g = (Math.sqrt(5) - 1) / 2;
  let c = hi - g * (hi - lo);
  let d = lo + g * (hi - lo);
  let fc = distanceAt(a, b, c);
  let fd = distanceAt(a, b, d);
  while (hi - lo > 1) {
    if (fc < fd) {
      hi = d;
      d = c;
      fd = fc;
      c = hi - g * (hi - lo);
      fc = distanceAt(a, b, c);
    } else {
      lo = c;
      c = d;
      fc = fd;
      d = lo + g * (hi - lo);
      fd = distanceAt(a, b, d);
    }
  }
  return (lo + hi) / 2;
}

/** SGP4 positions and velocities of all objects at t; valid[i] = 0 where SGP4 fails. */
function sampleAll(objects: readonly EncounterObject[], t: number) {
  const n = objects.length;
  const p = new Float64Array(3 * n);
  const v = new Float64Array(3 * n);
  const valid = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const s = propagateAt(objects[i]!.satrec, t);
    if (!s.ok) continue;
    p[3 * i] = s.r.x;
    p[3 * i + 1] = s.r.y;
    p[3 * i + 2] = s.r.z;
    v[3 * i] = s.v.x;
    v[3 * i + 1] = s.v.y;
    v[3 * i + 2] = s.v.z;
    valid[i] = 1;
  }
  return { p, v, valid };
}

interface Candidate {
  readonly t: number;
  readonly dist: number;
}

/** Close approaches between any two of `objects` from `from` to `to`, closest first. */
export function findEncounters(
  objects: readonly EncounterObject[],
  from: UnixMs,
  to: UnixMs,
  options: EncounterOptions = {},
): Encounter[] {
  const threshold = options.thresholdKm ?? 10;
  const minRel = options.minRelSpeedKmS ?? 0.5;
  const stepS = options.stepS ?? 10;
  const n = objects.length;
  const H = SAMPLE_STEP_S;
  const half = stepS / 2;
  const R = threshold + MAX_REL_SPEED_KMS * half + PAD_KM;
  const near = threshold + PAD_KM;
  // A pair's relative speed changes little within a step; screen with 80 % of the minimum.
  const minRelScreen2 = (0.8 * minRel) ** 2;

  const passive = Uint8Array.from(objects, (o) => (o.passive ? 1 : 0));
  const P = new Float64Array(3 * n);
  const V = new Float64Array(3 * n);
  const ok = new Uint8Array(n);
  const cx = new Int32Array(n);
  const cy = new Int32Array(n);
  const cz = new Int32Array(n);
  const size = 1 << HASH_BITS;
  const mask = size - 1;
  const start = new Int32Array(size + 1);
  const order = new Int32Array(n);
  const hashOf = new Int32Array(n);
  const hash = (x: number, y: number, z: number) =>
    (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) & mask;

  /** Pair key (i·n + j, i < j) → candidate approaches */
  const candidates = new Map<number, Candidate[]>();

  let A = sampleAll(objects, from);
  const steps = Math.ceil((to - from) / 1000 / H);
  for (let k = 0; k < steps; k++) {
    const tA = from + k * H * 1000;
    const B = sampleAll(objects, tA + H * 1000);

    for (let j = 0; j * stepS < H; j++) {
      const t = tA + j * stepS * 1000;
      if (t > to) break;
      const u = (j * stepS) / H;
      const [w0, w1, w2, w3] = hermiteWeights(u);
      const [r0, r1, r2, r3] = hermiteRateWeights(u);

      // Interpolated state, and each object's grid cube and hash bucket.
      start.fill(0);
      for (let i = 0; i < n; i++) {
        ok[i] = A.valid[i]! & B.valid[i]!;
        if (!ok[i]) continue;
        for (let c = 0; c < 3; c++) {
          const q = 3 * i + c;
          const pa = A.p[q]!;
          const va = A.v[q]!;
          const pb = B.p[q]!;
          const vb = B.v[q]!;
          P[q] = w0 * pa + w1 * H * va + w2 * pb + w3 * H * vb;
          V[q] = (r0 * pa + r1 * H * va + r2 * pb + r3 * H * vb) / H;
        }
        cx[i] = Math.floor(P[3 * i]! / R);
        cy[i] = Math.floor(P[3 * i + 1]! / R);
        cz[i] = Math.floor(P[3 * i + 2]! / R);
        const h = hash(cx[i]!, cy[i]!, cz[i]!);
        hashOf[i] = h;
        start[h + 1]!++;
      }
      // Counting sort: objects grouped by bucket, bucket b at order[start[b] .. start[b+1]).
      for (let b = 0; b < size; b++) start[b + 1]! += start[b]!;
      const fill = start.slice(0, size);
      for (let i = 0; i < n; i++) if (ok[i]) order[fill[hashOf[i]!]!++] = i;

      for (let i = 0; i < n; i++) {
        if (!ok[i]) continue;
        const xi = P[3 * i]!;
        const yi = P[3 * i + 1]!;
        const zi = P[3 * i + 2]!;
        for (let dx = -1; dx <= 1; dx++)
          for (let dy = -1; dy <= 1; dy++)
            for (let dz = -1; dz <= 1; dz++) {
              const ex = cx[i]! + dx;
              const ey = cy[i]! + dy;
              const ez = cz[i]! + dz;
              const h = hash(ex, ey, ez);
              for (let s = start[h]!; s < start[h + 1]!; s++) {
                const o = order[s]!;
                // Each pair once (o > i); skip other cubes that share the bucket.
                if (o <= i || cx[o] !== ex || cy[o] !== ey || cz[o] !== ez) continue;
                if (passive[i] && passive[o]) continue;
                const rx = P[3 * o]! - xi;
                const ry = P[3 * o + 1]! - yi;
                const rz = P[3 * o + 2]! - zi;
                if (rx * rx + ry * ry + rz * rz > R * R) continue;
                const vx = V[3 * o]! - V[3 * i]!;
                const vy = V[3 * o + 1]! - V[3 * i + 1]!;
                const vz = V[3 * o + 2]! - V[3 * i + 2]!;
                const vv = vx * vx + vy * vy + vz * vz;
                if (vv < minRelScreen2) continue;
                let tau = -(rx * vx + ry * vy + rz * vz) / vv;
                tau = Math.max(-half, Math.min(half, tau));
                const mx = rx + vx * tau;
                const my = ry + vy * tau;
                const mz = rz + vz * tau;
                const d2 = mx * mx + my * my + mz * mz;
                if (d2 > near * near) continue;
                const key = i * n + o;
                const list = candidates.get(key);
                const c = { t: t + tau * 1000, dist: Math.sqrt(d2) };
                if (list) list.push(c);
                else candidates.set(key, [c]);
              }
            }
      }
    }
    A = B;
    options.onProgress?.((k + 1) / steps);
  }

  // Merge each pair's candidates into separate approaches and refine each with SGP4.
  const out: Encounter[] = [];
  const gapMs = 2 * stepS * 1000;
  for (const [key, list] of candidates) {
    const i = Math.floor(key / n);
    const o = key % n;
    const a = objects[i]!;
    const b = objects[o]!;
    list.sort((x, y) => x.t - y.t);
    let group: Candidate[] = [];
    const flush = () => {
      if (group.length === 0) return;
      const best = group.reduce((m, c) => (c.dist < m.dist ? c : m));
      group = [];
      const tca = refine(a.satrec, b.satrec, best.t - stepS * 1000, best.t + stepS * 1000);
      if (tca < from || tca > to) return;
      const sa = propagateAt(a.satrec, tca);
      const sb = propagateAt(b.satrec, tca);
      if (!sa.ok || !sb.ok) return;
      const missKm = norm(sub(sa.r, sb.r));
      const relSpeedKmS = norm(sub(sa.v, sb.v));
      if (missKm > threshold || relSpeedKmS < minRel) return;
      const [lo, hi] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
      out.push({ a: lo, b: hi, t: tca, missKm, relSpeedKmS });
    };
    for (const c of list) {
      if (group.length > 0 && c.t - group[group.length - 1]!.t > gapMs) flush();
      group.push(c);
    }
    flush();
  }
  return out.sort((x, y) => x.missKm - y.missKm);
}
