// Search, filters and the shareable link (module 5). Pure logic, no browser.

import type { CatalogEntry } from '@sat-viewer/shared';
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

describe('filters', () => {
  const classes = ['LEO', 'LEO', 'LEO', 'LEO', 'MEO', 'GEO'] as const;

  it('no filters: everything passes', () => {
    expect([...filterMask(NO_FILTERS, CATALOG, classes)]).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it('owner, class, constellation and launch years combine with AND', () => {
    const f = { ...NO_FILTERS, owner: 'US', classes: ['LEO' as const] };
    expect([...filterMask(f, CATALOG, classes)]).toEqual([0, 0, 1, 1, 0, 0]);
    const years = { ...NO_FILTERS, yearFrom: 2016, yearTo: 2019 };
    expect([...filterMask(years, CATALOG, classes)]).toEqual([0, 0, 1, 1, 0, 1]);
    const group = { ...NO_FILTERS, constellation: 'starlink', yearTo: 2018 };
    expect([...filterMask(group, CATALOG, classes)]).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('an object with no launch date fails a year filter', () => {
    const e = entry({ norad: 1, name: 'X', launchDate: null });
    expect(passes({ ...NO_FILTERS, yearFrom: 1957 }, e, 'LEO')).toBe(false);
    expect(passes(NO_FILTERS, e, 'LEO')).toBe(true);
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
      },
    };
    const hash = formatHash(s);
    expect(hash).toBe('sat=25544&owner=PRC&class=LEO,GEO&from=2015&to=2020&group=starlink');
    expect(parseHash('#' + hash)).toEqual(s);
  });

  it('empty state is an empty hash; bad values are ignored', () => {
    expect(formatHash({ sat: null, filters: NO_FILTERS })).toBe('');
    expect(parseHash('#sat=abc&class=leo,XYZ,leo&from=20&to=1999x')).toEqual({
      sat: null,
      filters: { ...NO_FILTERS, classes: ['LEO'] },
    });
  });
});
