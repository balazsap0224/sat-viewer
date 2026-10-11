// Filters (SPEC.md 7.2): owner, orbit class, launch year range, constellation. An object is
// shown when it passes every filter that is set. Objects that do not pass are hidden on the
// globe and cannot be hovered or picked.

import type { OrbitClass } from '@sat-viewer/core';
import type { CatalogEntry } from '@sat-viewer/shared';
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
}

export const NO_FILTERS: Filters = {
  owner: null,
  classes: [],
  yearFrom: null,
  yearTo: null,
  constellation: null,
};

export const isFiltering = (f: Filters): boolean =>
  f.owner !== null ||
  f.classes.length > 0 ||
  f.yearFrom !== null ||
  f.yearTo !== null ||
  f.constellation !== null;

/** Launch year from "YYYY-MM-DD", or null. */
export const launchYear = (entry: CatalogEntry | undefined): number | null =>
  entry?.launchDate ? Number(entry.launchDate.slice(0, 4)) : null;

/**
 * Does one object pass the filters? An object with no catalog entry (none at the moment, but
 * possible after a partial data run) only passes when no catalog-based filter is set, and an
 * object with no launch date fails a launch year filter.
 */
export function passes(f: Filters, entry: CatalogEntry | undefined, cls: OrbitClass): boolean {
  if (f.classes.length > 0 && !f.classes.includes(cls)) return false;
  if (f.owner !== null && entry?.ownerCode !== f.owner) return false;
  if (f.constellation !== null && entry?.constellation !== f.constellation) return false;
  if (f.yearFrom !== null || f.yearTo !== null) {
    const y = launchYear(entry);
    if (y === null) return false;
    if (f.yearFrom !== null && y < f.yearFrom) return false;
    if (f.yearTo !== null && y > f.yearTo) return false;
  }
  return true;
}

/** 1 for every object that passes, 0 otherwise (same order as the data rows). */
export function filterMask(
  f: Filters,
  catalog: readonly (CatalogEntry | undefined)[],
  classes: readonly OrbitClass[],
): Uint8Array {
  const mask = new Uint8Array(classes.length);
  for (let i = 0; i < classes.length; i++) mask[i] = passes(f, catalog[i], classes[i]!) ? 1 : 0;
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
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export const useFilters = (): Filters =>
  useSyncExternalStore(filtersStore.subscribe, filtersStore.get);
