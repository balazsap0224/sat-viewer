// The visitor's location for pass predictions (SPEC.md 7.2 "My location"): from the browser's
// geolocation or typed in. Remembered in this browser only (localStorage, a per-viewer
// convenience); it never leaves the page.

import { useSyncExternalStore } from 'react';

export interface ObserverLocation {
  readonly latDeg: number;
  readonly lonDeg: number;
  /** Height above the ellipsoid [km]; 0 when unknown (a few hundred metres change little) */
  readonly altKm: number;
}

const KEY = 'satviewer.observer';

/** A typed location, or null when it is not a valid latitude/longitude. */
export function parseLocation(lat: string, lon: string): ObserverLocation | null {
  const la = Number(lat.trim().replace(',', '.'));
  const lo = Number(lon.trim().replace(',', '.'));
  if (lat.trim() === '' || lon.trim() === '' || !Number.isFinite(la) || !Number.isFinite(lo))
    return null;
  if (la < -90 || la > 90 || lo < -180 || lo > 180) return null;
  return { latDeg: la, lonDeg: lo, altKm: 0 };
}

function load(): ObserverLocation | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<ObserverLocation>;
    if (typeof v.latDeg !== 'number' || typeof v.lonDeg !== 'number') return null;
    return (
      parseLocation(String(v.latDeg), String(v.lonDeg)) && {
        latDeg: v.latDeg,
        lonDeg: v.lonDeg,
        altKm: typeof v.altKm === 'number' ? v.altKm : 0,
      }
    );
  } catch {
    return null;
  }
}

let current: ObserverLocation | null = load();
const listeners = new Set<() => void>();

export const observerStore = {
  get: (): ObserverLocation | null => current,
  set(next: ObserverLocation | null) {
    current = next;
    try {
      if (next) localStorage.setItem(KEY, JSON.stringify(next));
      else localStorage.removeItem(KEY);
    } catch {
      // Storage blocked (private window): the location just is not remembered.
    }
    for (const l of listeners) l();
  },
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export const useObserver = (): ObserverLocation | null =>
  useSyncExternalStore(observerStore.subscribe, observerStore.get);
