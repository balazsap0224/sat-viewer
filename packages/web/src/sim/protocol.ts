// Messages between the page and the SGP4 worker (propagation.worker.ts).

import type { ElementRow } from '@sat-viewer/shared';

export type ToWorker =
  /** Initialise SGP4 for every object (once, after the data has loaded) */
  | { readonly type: 'init'; readonly rows: readonly ElementRow[] }
  /** Compute one sample at shown time t (Unix ms) */
  | { readonly type: 'sample'; readonly t: number };

/** Positions and velocities of every object at one instant, in scene units. */
export interface Sample {
  readonly t: number;
  /** x, y, z per object [Earth radii], scene frame (coords.ts) */
  readonly pos: Float32Array;
  /** x, y, z per object [Earth radii per second] */
  readonly vel: Float32Array;
  /** 1 where SGP4 gave a position, 0 where it failed (the object is hidden) */
  readonly ok: Uint8Array;
  /** How long the worker took [ms] */
  readonly computeMs: number;
}

export type FromWorker =
  | { readonly type: 'ready'; readonly count: number; readonly initFailures: number }
  | ({ readonly type: 'sample' } & Sample);
