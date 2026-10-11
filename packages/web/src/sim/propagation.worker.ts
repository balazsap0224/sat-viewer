// The SGP4 worker (SPEC.md 7.3): runs SGP4 for every object off the main thread, so the
// globe keeps 60 fps. The page asks for samples at given times; each answer is three typed
// arrays, transferred (not copied) back.

import { propagateAt, R_EARTH, type SatRec } from '@sat-viewer/core';
import { satrecFromRow } from '../data/elements';
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
        return satrecFromRow(r);
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
