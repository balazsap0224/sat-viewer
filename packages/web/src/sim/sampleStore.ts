// Which SGP4 samples to keep and ask for (SPEC.md 7.3).
//
// Samples sit on a fixed grid of shown times, every SAMPLE_STEP_S seconds (k = 0, 1, 2, …
// counted from the Unix epoch). To draw time t the globe needs the two grid points around
// it, kA = ⌊t / step⌋ and kA + 1. One more is asked for ahead in the direction time is moving,
// so it is ready before it is needed. Older samples are dropped.
//
// Pure logic (no worker, no DOM) so it is tested on its own; SatellitePoints.tsx connects it
// to the worker.

import { SAMPLE_STEP_S } from './hermite';
import type { Sample } from './protocol';

const STEP_MS = SAMPLE_STEP_S * 1000;

export const gridIndex = (t: number): number => Math.floor(t / STEP_MS);
export const gridTime = (k: number): number => k * STEP_MS;

export interface Bracket {
  readonly a: Sample;
  readonly b: Sample;
  /** Fraction of the way from a to b, 0..1 */
  readonly u: number;
}

export class SampleStore {
  private readonly samples = new Map<number, Sample>();
  private readonly pending = new Set<number>();
  /** The last bracket that was complete: shown while a jump in time is being computed */
  private last: Bracket | undefined;

  constructor(private readonly request: (t: number) => void) {}

  /** A sample arrived from the worker. */
  receive(sample: Sample): void {
    const k = gridIndex(sample.t);
    this.pending.delete(k);
    this.samples.set(k, sample);
  }

  /**
   * Called every frame with the shown time and the clock rate. Asks for missing samples,
   * drops unneeded ones, and returns what to draw.
   */
  update(t: number, rate: number): Bracket | undefined {
    const kA = gridIndex(t);
    const ahead = rate < 0 ? kA - 1 : kA + 2;
    const wanted = [kA, kA + 1, ahead];
    for (const k of wanted) {
      if (!this.samples.has(k) && !this.pending.has(k)) {
        this.pending.add(k);
        this.request(gridTime(k));
      }
    }
    for (const k of this.samples.keys()) {
      if (!wanted.includes(k)) this.samples.delete(k);
    }
    // Requests far from now (after a jump) are not worth waiting for; let them be asked again.
    for (const k of this.pending) {
      if (Math.abs(k - kA) > 3) this.pending.delete(k);
    }

    const a = this.samples.get(kA);
    const b = this.samples.get(kA + 1);
    if (a && b) {
      this.last = { a, b, u: (t - a.t) / (b.t - a.t) };
      return this.last;
    }
    // Not ready yet (first load or a jump in time): keep showing the last picture, frozen.
    return this.last && { ...this.last, u: Math.min(1, Math.max(0, this.last.u)) };
  }
}
