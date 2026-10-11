// The simulation clock: the instant (real UTC) the globe shows.
//
// Shown time advances as  t = anchorT + rate × (realElapsed).
// Changing the rate or jumping in time re-anchors, so time never jumps when the rate changes.
// The 3D scene reads `now()` every frame; React UI subscribes for changes to the rate or
// anchor and polls `now()` for the ticking display.
//
// The shown time is kept within ±7 days of the real time (SPEC.md 6.1 step 5, 7.2): SGP4's
// error grows by a few km per day away from the element epoch. At the limit the clock stops.

import { MS_PER_DAY, type UnixMs } from '@sat-viewer/core';
import { useSyncExternalStore } from 'react';

/** How far the shown time may be from the real time [days] (SPEC.md 7.2, [PROPOSED]) */
export const TIME_WINDOW_DAYS = 7;
/** Fastest speed (SPEC.md 7.2, [PROPOSED]) */
export const MAX_RATE = 1000;

export interface ClockState {
  readonly anchorT: UnixMs;
  /** performance.now() at the anchor [ms] */
  readonly anchorReal: number;
  /** Shown seconds per real second (1 = real time, 0 = paused, negative = backwards) */
  readonly rate: number;
}

let state: ClockState = { anchorT: Date.now(), anchorReal: performance.now(), rate: 1 };
const listeners = new Set<() => void>();

function setState(next: ClockState) {
  state = next;
  for (const listener of listeners) listener();
}

/** The allowed range around the real time now. */
export function timeWindow(): { readonly min: UnixMs; readonly max: UnixMs } {
  const real = Date.now();
  return {
    min: real - TIME_WINDOW_DAYS * MS_PER_DAY,
    max: real + TIME_WINDOW_DAYS * MS_PER_DAY,
  };
}

const clamp = (t: UnixMs) => {
  const w = timeWindow();
  return Math.min(w.max, Math.max(w.min, t));
};

function now(): UnixMs {
  const t = state.anchorT + state.rate * (performance.now() - state.anchorReal);
  const c = clamp(t);
  // Reaching the edge of the window pauses the clock there (outside the render loop, since
  // listeners re-render React).
  if (c !== t && state.rate !== 0) queueMicrotask(() => simClock.setTime(c, 0));
  return c;
}

export const simClock = {
  now,
  getState: () => state,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  /** Jumps to time t, optionally with a new rate. */
  setTime(t: UnixMs, rate: number = state.rate) {
    setState({ anchorT: clamp(t), anchorReal: performance.now(), rate });
  },
  setRate(rate: number) {
    setState({ anchorT: now(), anchorReal: performance.now(), rate });
  },
  /** Back to the real current time at real speed. */
  live() {
    setState({ anchorT: Date.now(), anchorReal: performance.now(), rate: 1 });
  },
};

/** React hook: re-renders when the rate or anchor changes (not on every tick). */
export function useClockState(): ClockState {
  return useSyncExternalStore(simClock.subscribe, simClock.getState);
}
