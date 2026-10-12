// The shareable link (SPEC.md 7.2): the selected satellite and the filters live in the URL's
// hash, e.g. `#sat=25544` or `#owner=PRC&class=LEO,GEO&from=2015&to=2020&group=starlink`.
// Ranges are "min-max" with either side optional (`alt=500-600`, `incl=-60`), and the chosen
// satellites a comma list (`only=25544,48274`). `debris=1` shows the debris clouds.
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

/** "500-600", "500-" or "-600" → [min, max] (null = open); anything else → both null. */
function range(s: string | null): [number | null, number | null] {
  const m = s === null ? null : /^(\d+(?:\.\d+)?)?-(\d+(?:\.\d+)?)?$/.exec(s);
  if (!m) return [null, null];
  return [m[1] !== undefined ? Number(m[1]) : null, m[2] !== undefined ? Number(m[2]) : null];
}

const formatRange = (min: number | null, max: number | null): string | null =>
  min === null && max === null ? null : `${min ?? ''}-${max ?? ''}`;

/** Reads a hash ("#sat=25544&…", with or without the "#"). Unknown or bad values are ignored. */
export function parseHash(hash: string): UrlState {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const sat = p.get('sat');
  const classes = (p.get('class') ?? '')
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter((c): c is OrbitClass => (ORBIT_CLASSES as readonly string[]).includes(c));
  const [altMin, altMax] = range(p.get('alt'));
  const [inclMin, inclMax] = range(p.get('incl'));
  const only = (p.get('only') ?? '')
    .split(',')
    .filter((n) => /^\d{1,9}$/.test(n))
    .map(Number);
  return {
    sat: sat !== null && /^\d{1,9}$/.test(sat) ? Number(sat) : null,
    filters: {
      owner: p.get('owner') || null,
      classes: [...new Set(classes)],
      yearFrom: year(p.get('from')),
      yearTo: year(p.get('to')),
      constellation: p.get('group') || null,
      altMin,
      altMax,
      inclMin,
      inclMax,
      only: [...new Set(only)],
      debris: p.get('debris') === '1',
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
  const alt = formatRange(f.altMin, f.altMax);
  if (alt !== null) p.set('alt', alt);
  const incl = formatRange(f.inclMin, f.inclMax);
  if (incl !== null) p.set('incl', incl);
  if (f.only.length > 0) p.set('only', f.only.join(','));
  if (f.debris) p.set('debris', '1');
  // URLSearchParams escapes the comma; it is safe in a hash and reads better unescaped.
  return p.toString().replace(/%2C/g, ',');
}

export const EMPTY_URL_STATE: UrlState = { sat: null, filters: NO_FILTERS };
