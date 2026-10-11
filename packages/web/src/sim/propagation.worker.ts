// The SGP4 worker (SPEC.md 7.3): runs SGP4 for every object off the main thread, so the
// globe keeps 60 fps. The page asks for samples at given times; each answer is three typed
// arrays, transferred (not copied) back.

import { propagateAt, R_EARTH, type SatRec, satrecFromElements } from '@sat-viewer/core';
import type { FromWorker, ToWorker } from './protocol';

let satrecs: (SatRec | undefined)[] = [];

const post = (msg: FromWorker, transfer: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(msg, transfer);

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  if (msg.type === 'init') {
    let initFailures = 0;
    satrecs = msg.rows.map((r) => {
      try {
        return satrecFromElements({
          NORAD_CAT_ID: r[0],
          EPOCH: r[1],
          MEAN_MOTION: r[2],
          ECCENTRICITY: r[3],
          INCLINATION: r[4],
          RA_OF_ASC_NODE: r[5],
          ARG_OF_PERICENTER: r[6],
          MEAN_ANOMALY: r[7],
          BSTAR: r[8],
          MEAN_MOTION_DOT: r[9],
          MEAN_MOTION_DDOT: r[10],
        });
      } catch {
        initFailures++;
        return undefined;
      }
    });
    post({ type: 'ready', count: satrecs.length, initFailures });
    return;
  }

  const start = performance.now();
  const n = satrecs.length;
  const pos = new Float32Array(3 * n);
  const vel = new Float32Array(3 * n);
  const ok = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const satrec = satrecs[i];
    if (!satrec) continue;
    const s = propagateAt(satrec, msg.t);
    if (!s.ok) continue;
    // TEME → scene (coords.ts): (x, z, −y), in Earth radii.
    pos[3 * i] = s.r.x / R_EARTH;
    pos[3 * i + 1] = s.r.z / R_EARTH;
    pos[3 * i + 2] = -s.r.y / R_EARTH;
    vel[3 * i] = s.v.x / R_EARTH;
    vel[3 * i + 1] = s.v.z / R_EARTH;
    vel[3 * i + 2] = -s.v.y / R_EARTH;
    ok[i] = 1;
  }
  post({ type: 'sample', t: msg.t, pos, vel, ok, computeMs: performance.now() - start }, [
    pos.buffer,
    vel.buffer,
    ok.buffer,
  ]);
};
