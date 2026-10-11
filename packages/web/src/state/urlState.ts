// The shareable link (SPEC.md 7.2): the selected satellite and the filters live in the URL's
// hash, e.g. `#sat=25544` or `#owner=PRC&class=LEO,GEO&from=2015&to=2020&group=starlink`.
// The hash (not the query string) keeps the site purely static: the host never sees it.

import { ORBIT_CLASSES, type OrbitClass } from '@sat-viewer/core';
import { type Filters, NO_FILTERS } from './filters';

export interface UrlState {
  readonly sat: number | null;
  readonly filters: Filters;
}

const year = (s: string | null): number | null => {
  if (s === null || !/^\d{4}$/.test(s)) return null;
  return Number(s);
};

/** Reads a hash ("#sat=25544&…", with or without the "#"). Unknown or bad values are ignored. */
export function parseHash(hash: string): UrlState {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const sat = p.get('sat');
  const classes = (p.get('class') ?? '')
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter((c): c is OrbitClass => (ORBIT_CLASSES as readonly string[]).includes(c));
  return {
    sat: sat !== null && /^\d{1,9}$/.test(sat) ? Number(sat) : null,
    filters: {
      owner: p.get('owner') || null,
      classes: [...new Set(classes)],
      yearFrom: year(p.get('from')),
      yearTo: year(p.get('to')),
      constellation: p.get('group') || null,
    },
  };
}

/** Writes the hash, without the "#"; empty when nothing is selected or filtered. */
export function formatHash(s: UrlState): string {
  const p = new URLSearchParams();
  if (s.sat !== null) p.set('sat', String(s.sat));
  const f = s.filters;
  if (f.owner !== null) p.set('owner', f.owner);
  if (f.classes.length > 0) p.set('class', f.classes.join(','));
  if (f.yearFrom !== null) p.set('from', String(f.yearFrom));
  if (f.yearTo !== null) p.set('to', String(f.yearTo));
  if (f.constellation !== null) p.set('group', f.constellation);
  // URLSearchParams escapes the comma; it is safe in a hash and reads better unescaped.
  return p.toString().replace(/%2C/g, ',');
}

export const EMPTY_URL_STATE: UrlState = { sat: null, filters: NO_FILTERS };
