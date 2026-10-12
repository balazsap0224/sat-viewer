// Filters (SPEC.md 7.2): owner, orbit class, launch year range, constellation, altitude and
// inclination ranges. An object is shown when it passes every filter that is set. Objects
// that do not pass are hidden on the globe and cannot be hovered or picked.
//
// A list of chosen satellites ("show only these") overrides the rest: while it is not empty,
// exactly those objects are shown and the other filters are paused (kept, but not applied).
//
// Debris fragments (content/debris-clouds.json) are hidden unless `debris` is on; then they
// pass through the other filters like any object.

import { apsidesKm, type OrbitClass } from '@sat-viewer/core';
import type { CatalogEntry, ElementRow } from '@sat-viewer/shared';
import { useSyncExternalStore } from 'react';

export interface Filters {
  /** CelesTrak owner code, or null for any */
  readonly owner: string | null;
  /** Classes to show; empty means all */
  readonly classes: readonly OrbitClass[];
  /** Launch year range, inclusive; null for open-ended */
  readonly yearFrom: number | null;
  readonly yearTo: number | null;
  /** Constellation id (content/constellations.json), or null for any */
  readonly constellation: string | null;
  /** Altitude range [km]: the whole orbit (perigee to apogee) must lie inside; null = open */
  readonly altMin: number | null;
  readonly altMax: number | null;
  /** Inclination range [deg], inclusive; null = open */
  readonly inclMin: number | null;
  readonly inclMax: number | null;
  /** NORAD numbers to show exclusively; empty = not used */
  readonly only: readonly number[];
  /** Show the debris clouds (off by default) */
  readonly debris: boolean;
}

export const NO_FILTERS: Filters = {
  owner: null,
  classes: [],
  yearFrom: null,
  yearTo: null,
  constellation: null,
  altMin: null,
  altMax: null,
  inclMin: null,
  inclMax: null,
  only: [],
  debris: false,
};

export const isFiltering = (f: Filters): boolean =>
  f.owner !== null ||
  f.classes.length > 0 ||
  f.yearFrom !== null ||
  f.yearTo !== null ||
  f.constellation !== null ||
  f.altMin !== null ||
  f.altMax !== null ||
  f.inclMin !== null ||
  f.inclMax !== null ||
  f.only.length > 0;

/** Launch year from "YYYY-MM-DD", or null. */
export const launchYear = (entry: CatalogEntry | undefined): number | null =>
  entry?.launchDate ? Number(entry.launchDate.slice(0, 4)) : null;

/**
 * Does one object pass the filters? An object with no catalog entry (none at the moment, but
 * possible after a partial data run) only passes when no catalog-based filter is set, and an
 * object with no launch date fails a launch year filter.
 */
export function passes(
  f: Filters,
  entry: CatalogEntry | undefined,
  cls: OrbitClass,
  row: ElementRow,
): boolean {
  if (f.only.length > 0) return f.only.includes(row[0]);
  if (!f.debris && entry?.debrisCloud) return false;
  if (f.classes.length > 0 && !f.classes.includes(cls)) return false;
  if (f.owner !== null && entry?.ownerCode !== f.owner) return false;
  if (f.constellation !== null && entry?.constellation !== f.constellation) return false;
  if (f.yearFrom !== null || f.yearTo !== null) {
    const y = launchYear(entry);
    if (y === null) return false;
    if (f.yearFrom !== null && y < f.yearFrom) return false;
    if (f.yearTo !== null && y > f.yearTo) return false;
  }
  if (f.altMin !== null || f.altMax !== null) {
    const { perigeeKm, apogeeKm } = apsidesKm(row[2], row[3]);
    if (f.altMin !== null && perigeeKm < f.altMin) return false;
    if (f.altMax !== null && apogeeKm > f.altMax) return false;
  }
  if (f.inclMin !== null && row[4] < f.inclMin) return false;
  if (f.inclMax !== null && row[4] > f.inclMax) return false;
  return true;
}

/** 1 for every object that passes, 0 otherwise (same order as the data rows). */
export function filterMask(
  f: Filters,
  catalog: readonly (CatalogEntry | undefined)[],
  classes: readonly OrbitClass[],
  rows: readonly ElementRow[],
): Uint8Array {
  const mask = new Uint8Array(classes.length);
  for (let i = 0; i < classes.length; i++)
    mask[i] = passes(f, catalog[i], classes[i]!, rows[i]!) ? 1 : 0;
  return mask;
}

// The store: one Filters value shared by the panel, the globe and the URL.
let current: Filters = NO_FILTERS;
const listeners = new Set<() => void>();

export const filtersStore = {
  get: (): Filters => current,
  set(next: Filters) {
    current = next;
    for (const l of listeners) l();
  },
  update(patch: Partial<Filters>) {
    filtersStore.set({ ...current, ...patch });
  },
  /** Adds a satellite to the "show only these" list (no-op if it is there). */
  addOnly(norad: number) {
    if (!current.only.includes(norad)) filtersStore.update({ only: [...current.only, norad] });
  },
  removeOnly(norad: number) {
    filtersStore.update({ only: current.only.filter((n) => n !== norad) });
  },
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export const useFilters = (): Filters =>
  useSyncExternalStore(filtersStore.subscribe, filtersStore.get);
