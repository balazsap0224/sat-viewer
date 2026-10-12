// Search, filters and the shareable link (module 5). Pure logic, no browser.

import type { CatalogEntry, ElementRow } from '@sat-viewer/shared';
import { describe, expect, it } from 'vitest';
import { filterMask, NO_FILTERS, passes } from './filters';
import { buildSearchIndex, search } from './search';
import { formatHash, parseHash } from './urlState';

const entry = (over: Partial<CatalogEntry> & { norad: number; name: string }): CatalogEntry => ({
  cosparId: '2000-001A',
  ownerCode: 'US',
  objectType: 'PAY',
  opsStatus: '+',
  launchDate: '2000-01-01',
  launchSite: 'AFETR',
  constellation: null,
  debrisCloud: null,
  gcat: null,
  ...over,
});

const CATALOG: CatalogEntry[] = [
  entry({
    norad: 25544,
    name: 'ISS (ZARYA)',
    cosparId: '1998-067A',
    ownerCode: 'ISS',
    launchDate: '1998-11-20',
  }),
  entry({
    norad: 48274,
    name: 'CSS (TIANHE)',
    cosparId: '2021-035A',
    ownerCode: 'PRC',
    launchDate: '2021-04-29',
  }),
  entry({
    norad: 44713,
    name: 'STARLINK-1007',
    cosparId: '2019-074A',
    launchDate: '2019-11-11',
    constellation: 'starlink',
  }),
  entry({
    norad: 44714,
    name: 'STARLINK-1008',
    cosparId: '2019-074B',
    launchDate: '2019-11-11',
    constellation: 'starlink',
  }),
  entry({ norad: 2544, name: 'OLD SAT', cosparId: '1966-001A', launchDate: '1966-01-01' }),
  entry({
    norad: 41866,
    name: 'GOES 16',
    cosparId: '2016-071A',
    launchDate: '2016-11-19',
    gcat: {
      operator: null,
      manufacturer: null,
      bus: null,
      massKg: null,
      massEstimated: false,
      altName: 'GOES-R',
    },
  }),
];
const IDX = buildSearchIndex(
  CATALOG.map((e) => e.norad),
  CATALOG,
);
const names = (q: string) => search(IDX, q).map((r) => r.name);

describe('search', () => {
  it('finds the ISS by name, word, NORAD number and COSPAR designator', () => {
    expect(names('iss')[0]).toBe('ISS (ZARYA)');
    expect(names('zarya')[0]).toBe('ISS (ZARYA)');
    expect(names('25544')[0]).toBe('ISS (ZARYA)');
    expect(names('1998-067A')[0]).toBe('ISS (ZARYA)');
    expect(names('1998-067')[0]).toBe('ISS (ZARYA)');
  });

  it('NORAD numbers match exactly or by prefix', () => {
    expect(names('2544')).toEqual(['OLD SAT']);
    expect(names('4471')).toEqual(['STARLINK-1007', 'STARLINK-1008']);
  });

  it('prefix matches are sorted by length, then NORAD number', () => {
    expect(names('starlink')).toEqual(['STARLINK-1007', 'STARLINK-1008']);
  });

  it('matches the GCAT alternative name; empty query gives nothing', () => {
    expect(names('goes-r')).toEqual(['GOES 16']);
    expect(names('  ')).toEqual([]);
    expect(names('no such thing')).toEqual([]);
  });
});

/** An element row with a given mean motion [rev/day], eccentricity and inclination [deg]. */
const row = (norad: number, n: number, e: number, incl: number): ElementRow => [
  norad,
  '2026-10-11T00:00:00',
  n,
  e,
  incl,
  0,
  0,
  0,
  0,
  0,
  0,
];
// Mean motions: 15.49 rev/day ≈ 416 × 425 km (ISS), 15.6 ≈ 380 km, 15.06 ≈ 550 km (Starlink),
// 2.0057 ≈ 20,200 km (GPS), 1.0027 ≈ 35,786 km (GEO). Altitudes from core apsidesKm.
const ROWS: ElementRow[] = [
  row(25544, 15.49, 0.0007, 51.63),
  row(48274, 15.6, 0.0005, 41.47),
  row(44713, 15.06, 0.0001, 53.05),
  row(44714, 15.06, 0.0001, 53.05),
  row(2544, 2.0057, 0.01, 55),
  row(41866, 1.0027, 0.0001, 0.05),
];

describe('filters', () => {
  const classes = ['LEO', 'LEO', 'LEO', 'LEO', 'MEO', 'GEO'] as const;
  const mask = (f: typeof NO_FILTERS) => [...filterMask(f, CATALOG, classes, ROWS)];

  it('no filters: everything passes', () => {
    expect(mask(NO_FILTERS)).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it('owner, class, constellation and launch years combine with AND', () => {
    const f = { ...NO_FILTERS, owner: 'US', classes: ['LEO' as const] };
    expect(mask(f)).toEqual([0, 0, 1, 1, 0, 0]);
    const years = { ...NO_FILTERS, yearFrom: 2016, yearTo: 2019 };
    expect(mask(years)).toEqual([0, 0, 1, 1, 0, 1]);
    const group = { ...NO_FILTERS, constellation: 'starlink', yearTo: 2018 };
    expect(mask(group)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('an object with no launch date fails a year filter', () => {
    const e = entry({ norad: 1, name: 'X', launchDate: null });
    expect(passes({ ...NO_FILTERS, yearFrom: 1957 }, e, 'LEO', ROWS[0]!)).toBe(false);
    expect(passes(NO_FILTERS, e, 'LEO', ROWS[0]!)).toBe(true);
  });

  it('altitude: the whole orbit (perigee to apogee) must lie in the range', () => {
    // ISS 416 × 425 km, Tiangong ≈ 380 km, Starlink ≈ 550 km, GPS ≈ 20,000 km, GEO ≈ 35,786 km
    expect(mask({ ...NO_FILTERS, altMin: 400, altMax: 600 })).toEqual([1, 0, 1, 1, 0, 0]);
    expect(mask({ ...NO_FILTERS, altMax: 420 })).toEqual([0, 1, 0, 0, 0, 0]); // ISS apogee 425
    expect(mask({ ...NO_FILTERS, altMin: 30000 })).toEqual([0, 0, 0, 0, 0, 1]);
  });

  it('inclination range is inclusive', () => {
    expect(mask({ ...NO_FILTERS, inclMin: 51.63, inclMax: 55 })).toEqual([1, 0, 1, 1, 1, 0]);
    expect(mask({ ...NO_FILTERS, inclMax: 1 })).toEqual([0, 0, 0, 0, 0, 1]);
  });

  it('debris fragments are hidden until debris is switched on; a chosen fragment always shows', () => {
    const deb = entry({ norad: 31000, name: 'FENGYUN 1C DEB', debrisCloud: 'fengyun-1c' });
    const r = row(31000, 14.2, 0.005, 98.8);
    expect(passes(NO_FILTERS, deb, 'LEO', r)).toBe(false);
    expect(passes({ ...NO_FILTERS, debris: true }, deb, 'LEO', r)).toBe(true);
    expect(passes({ ...NO_FILTERS, only: [31000] }, deb, 'LEO', r)).toBe(true);
    expect(passes({ ...NO_FILTERS, debris: true, inclMax: 90 }, deb, 'LEO', r)).toBe(false);
  });

  it('chosen satellites override every other filter', () => {
    const f = { ...NO_FILTERS, classes: ['GEO' as const], only: [25544, 2544] };
    expect(mask(f)).toEqual([1, 0, 0, 0, 1, 0]);
  });
});

describe('shareable link', () => {
  it('round trip', () => {
    const s = {
      sat: 25544,
      filters: {
        owner: 'PRC',
        classes: ['LEO' as const, 'GEO' as const],
        yearFrom: 2015,
        yearTo: 2020,
        constellation: 'starlink',
        altMin: 500,
        altMax: null,
        inclMin: 50.5,
        inclMax: 60,
        only: [25544, 48274],
        debris: true,
      },
    };
    const hash = formatHash(s);
    expect(hash).toBe(
      'sat=25544&owner=PRC&class=LEO,GEO&from=2015&to=2020&group=starlink&alt=500-&incl=50.5-60&only=25544,48274&debris=1',
    );
    expect(parseHash('#' + hash)).toEqual(s);
  });

  it('empty state is an empty hash; bad values are ignored', () => {
    expect(formatHash({ sat: null, filters: NO_FILTERS })).toBe('');
    expect(parseHash('#sat=abc&class=leo,XYZ,leo&from=20&to=1999x&alt=abc&only=1,x,1')).toEqual({
      sat: null,
      filters: { ...NO_FILTERS, classes: ['LEO'], only: [1] },
    });
  });
});
