// What the point cloud shows right now, for the parts of the page that need positions on the
// CPU (picking, labels): the current pair of SGP4 samples, how far between them, and the
// filter mask. SatellitePoints.tsx writes it every frame.

import { hermiteWeights } from '../sim/hermite';
import type { Bracket } from '../sim/sampleStore';
import type { PositionOf } from './pick';

let bracket: Bracket | undefined;
let mask: Uint8Array | undefined;

export const satField = {
  setBracket(b: Bracket | undefined) {
    bracket = b;
  },
  setMask(m: Uint8Array | undefined) {
    mask = m;
  },
  /** Interpolated scene position of object i (Hermite, as in the shader). */
  positionOf: ((i, out) => {
    const b = bracket;
    if (!b || !b.a.ok[i] || !b.b.ok[i] || (mask && !mask[i])) return false;
    const h = (b.b.t - b.a.t) / 1000;
    const [wa, wva, wb, wvb] = hermiteWeights(b.u);
    for (let k = 0; k < 3; k++) {
      const j = 3 * i + k;
      out[k] = wa * b.a.pos[j]! + wva * h * b.a.vel[j]! + wb * b.b.pos[j]! + wvb * h * b.b.vel[j]!;
    }
    return true;
  }) satisfies PositionOf,
};
