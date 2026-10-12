// Data job tests (SPEC.md 9): saved sample responses only, never the live network. The
// samples in fixtures/ are real records cut from the first live run (2026-10-11): the ISS,
// a GPS satellite, a Starlink, an object GCAT does not number ("NNA"), and an object with a
// 6-digit catalog number that GCAT does not list yet.

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  catalogFileSchema,
  constellationsSchema,
  debrisCloudsSchema,
  elementsFileSchema,
  encountersFileSchema,
  launchSitesSchema,
  ommRecordSchema,
  ownersSchema,
  satcatRecordSchema,
} from '@sat-viewer/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { build, parseWith } from '../src/build';
import { checkCount, checkEpochs, SanityError } from '../src/checks';
import { gcatIndex, parseGcatOrgs, parseGcatSatcat } from '../src/gcat';
import { dropUnpropagatable, merge, mergeDebris } from '../src/merge';
import { type FetchLike, fetchSource, SourceError, USER_AGENT } from '../src/politeFetch';
import { SOURCES } from '../src/sources';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const fixture = (name: string) => readFile(here(`fixtures/${name}`), 'utf8');
const contentDir = here('../../../content');

async function loadContent() {
  const read = async (f: string) =>
    JSON.parse(await readFile(join(contentDir, f), 'utf8')) as unknown;
  return {
    owners: ownersSchema.parse(await read('owners.json')),
    launchSites: launchSitesSchema.parse(await read('launch-sites.json')),
    constellations: constellationsSchema.parse(await read('constellations.json')),
  };
}

async function mergeFixtures() {
  const gp = z.array(ommRecordSchema).parse(JSON.parse(await fixture('gp-sample.json')));
  const satcat = z.array(satcatRecordSchema).parse(JSON.parse(await fixture('satcat-sample.json')));
  const gcat = parseGcatSatcat(await fixture('gcat-sample.tsv'));
  const orgs = parseGcatOrgs(await fixture('gcat-orgs-sample.tsv'));
  return merge({ gp, satcat, findGcat: gcatIndex(gcat), gcatOrgs: orgs, ...(await loadContent()) });
}

describe('merge (module 2: the owner checks these records)', () => {
  it('[2.1] ISS: SATCAT owner "ISS", launched 1998-11-20 from Baikonur, GCAT mass 20,281 kg (Zarya module)', async () => {
    const { entries } = await mergeFixtures();
    const iss = entries.find((e) => e.norad === 25544);
    expect(iss).toMatchObject({
      name: 'ISS (ZARYA)',
      cosparId: '1998-067A',
      ownerCode: 'ISS',
      launchDate: '1998-11-20',
      launchSite: 'TYMSC',
      constellation: null,
    });
    expect(iss?.gcat?.massKg).toBe(20281);
    expect(iss?.gcat?.manufacturer).toContain('Khrunichev');
  });

  it('[2.2] GPS III SV05 (NAVSTAR 81): constellation gps, Lockheed Martin A2100 bus, 4,400 kg', async () => {
    const { entries } = await mergeFixtures();
    const gps = entries.find((e) => e.norad === 48859);
    expect(gps).toMatchObject({ constellation: 'gps', ownerCode: 'US', launchDate: '2021-06-17' });
    expect(gps?.gcat).toMatchObject({ bus: 'A2100', massKg: 4400 });
    expect(gps?.gcat?.manufacturer).toContain('Lockheed Martin');
  });

  it('[2.3] STARLINK-1008: constellation starlink, built by SpaceX, 260 kg', async () => {
    const { entries } = await mergeFixtures();
    const s = entries.find((e) => e.norad === 44714);
    expect(s).toMatchObject({ name: 'STARLINK-1008', constellation: 'starlink', ownerCode: 'US' });
    expect(s?.gcat?.manufacturer).toContain('SpaceX');
    expect(s?.gcat?.massKg).toBe(260);
  });

  it('finds GCAT by JCAT when GCAT writes "NNA" instead of the catalog number (44310)', async () => {
    const { entries } = await mergeFixtures();
    expect(entries.find((e) => e.norad === 44310)?.gcat).not.toBeNull();
  });

  it('a 6-digit catalog number GCAT does not list yet is published without GCAT details', async () => {
    const { entries, rows } = await mergeFixtures();
    expect(rows.some((r) => r[0] === 100000)).toBe(true);
    expect(entries.find((e) => e.norad === 100000)?.gcat).toBeNull();
  });

  it('element rows keep the source values unchanged (ISS)', async () => {
    const gp = JSON.parse(await fixture('gp-sample.json')) as { NORAD_CAT_ID: number }[];
    const src = gp.find((r) => r.NORAD_CAT_ID === 25544) as Record<string, unknown>;
    const { rows } = await mergeFixtures();
    const row = rows.find((r) => r[0] === 25544);
    expect(row).toEqual([
      25544,
      src.EPOCH,
      src.MEAN_MOTION,
      src.ECCENTRICITY,
      src.INCLINATION,
      src.RA_OF_ASC_NODE,
      src.ARG_OF_PERICENTER,
      src.MEAN_ANOMALY,
      src.BSTAR,
      src.MEAN_MOTION_DOT,
      src.MEAN_MOTION_DDOT,
    ]);
  });

  it('skips decayed objects and objects without a SATCAT record', async () => {
    const gp = z.array(ommRecordSchema).parse(JSON.parse(await fixture('gp-sample.json')));
    const satcat = z
      .array(satcatRecordSchema)
      .parse(JSON.parse(await fixture('satcat-sample.json')));
    const decayed = satcat.map((s) =>
      s.NORAD_CAT_ID === 44714 ? { ...s, DECAY_DATE: '2026-10-01' } : s,
    );
    const r = merge({
      gp,
      satcat: decayed.filter((s) => s.NORAD_CAT_ID !== 48859),
      findGcat: () => undefined,
      gcatOrgs: new Map(),
      ...(await loadContent()),
    });
    expect(r.skipped.map((s) => [s.norad, s.reason])).toEqual([
      [48859, 'no SATCAT record'],
      [44714, 'decayed 2026-10-01'],
    ]);
    expect(r.rows).toHaveLength(3);
  });

  it('every content table passes its schema and the constellation patterns compile', async () => {
    const c = await loadContent();
    for (const k of c.constellations) expect(() => new RegExp(k.namePattern, 'i')).not.toThrow();
    expect(c.owners.US?.name).toBe('United States');
  });
});

describe('debris clouds (content/debris-clouds.json)', () => {
  it('[2.6] a Fengyun-1C record becomes a DEB entry with the parent satellite owner (PRC) and launch (1999-05-10, Taiyuan)', async () => {
    const gp = z
      .array(ommRecordSchema)
      .parse(JSON.parse(await fixture('gp-debris-fengyun-sample.json')));
    const clouds = debrisCloudsSchema.parse(
      JSON.parse(await readFile(join(contentDir, 'debris-clouds.json'), 'utf8')),
    );
    const base = await mergeFixtures();
    const merged = mergeDebris(
      base,
      gp,
      clouds.find((c) => c.id === 'fengyun-1c')!,
    );
    expect(merged.rows).toHaveLength(base.rows.length + 2);
    const e = merged.entries.find((x) => x.norad === gp[0]!.NORAD_CAT_ID)!;
    expect(e).toMatchObject({
      name: gp[0]!.OBJECT_NAME,
      cosparId: '1999-025A',
      ownerCode: 'PRC',
      objectType: 'DEB',
      launchDate: '1999-05-10',
      launchSite: 'TAISC',
      debrisCloud: 'fengyun-1c',
      gcat: null,
    });
    // Every active entry says it is not debris.
    expect(base.entries.every((x) => x.debrisCloud === null)).toBe(true);
  });

  it('a fragment already published (same number) is skipped as a duplicate', async () => {
    const gp = z
      .array(ommRecordSchema)
      .parse(JSON.parse(await fixture('gp-debris-fengyun-sample.json')));
    const clouds = debrisCloudsSchema.parse(
      JSON.parse(await readFile(join(contentDir, 'debris-clouds.json'), 'utf8')),
    );
    const once = mergeDebris(await mergeFixtures(), gp, clouds[0]!);
    const twice = mergeDebris(once, gp, clouds[0]!);
    expect(twice.rows).toHaveLength(once.rows.length);
    expect(twice.skipped.filter((x) => x.reason === 'duplicate element set')).toHaveLength(2);
  });
});

describe('validation', () => {
  it('a record with a missing field stops the job, naming the source and the field', async () => {
    const gp = JSON.parse(await fixture('gp-sample.json')) as Record<string, unknown>[];
    delete gp[0]?.MEAN_MOTION;
    expect(() => parseWith(z.array(ommRecordSchema), JSON.stringify(gp), 'CelesTrak GP')).toThrow(
      /CelesTrak GP: .*0\.MEAN_MOTION/,
    );
  });

  it('a non-JSON answer (e.g. an HTML error page) stops the job', () => {
    expect(() => parseWith(z.array(ommRecordSchema), '<html>', 'CelesTrak GP')).toThrow(
      /not valid JSON/,
    );
  });

  it('a GCAT file without the expected columns stops the job', () => {
    expect(() => parseGcatSatcat('#JCAT\tName\nS1\tx\n')).toThrow(/no column "Satcat"/);
  });
});

describe('sanity checks (SPEC.md 4.3)', () => {
  it('object count may change by up to ±10 % between runs', () => {
    expect(() => checkCount(1100, 1000)).not.toThrow();
    expect(() => checkCount(900, 1000)).not.toThrow();
    expect(() => checkCount(1101, 1000)).toThrow(SanityError);
    expect(() => checkCount(899, 1000)).toThrow(SanityError);
    expect(() => checkCount(0, undefined)).toThrow(SanityError);
    expect(() => checkCount(5, undefined)).not.toThrow();
  });

  it('epochs up to 3 days ahead are accepted, later ones stop the job', () => {
    const now = new Date('2026-10-11T12:00:00Z');
    expect(() => checkEpochs(['2026-10-12T17:36:20.007360'], now)).not.toThrow(); // Chandra, 30 h
    expect(() => checkEpochs(['2026-10-14T12:00:01'], now)).toThrow(SanityError);
    expect(() => checkEpochs(['garbage'], now)).toThrow(SanityError);
  });
});

describe('polite fetching (SPEC.md 4.3)', () => {
  let dir: string;
  beforeEach(async () => (dir = await mkdtemp(join(tmpdir(), 'satviewer-test-'))));
  afterEach(() => rm(dir, { recursive: true, force: true }));

  const source = { name: 'x.json', url: 'https://example.org/x', minAgeMs: 3_600_000 };
  const t0 = new Date('2026-10-11T00:00:00Z');
  const later = (ms: number) => new Date(t0.getTime() + ms);

  /** A fake server that records requests and answers from a list. */
  function fakeServer(answers: { status: number; body?: string; etag?: string }[]) {
    const requests: Record<string, string>[] = [];
    const impl: FetchLike = (_url, init) => {
      requests.push(init.headers);
      const a = answers.shift();
      if (!a) throw new Error('unexpected extra request');
      return Promise.resolve({
        status: a.status,
        statusText: String(a.status),
        headers: { get: (h: string) => (h === 'etag' ? (a.etag ?? null) : null) },
        text: () => Promise.resolve(a.body ?? ''),
      });
    };
    return { impl, requests };
  }

  it('sends the User-Agent with the contact address', async () => {
    const s = fakeServer([{ status: 200, body: '[]' }]);
    await fetchSource(source, dir, t0, s.impl);
    expect(s.requests[0]?.['User-Agent']).toBe(USER_AGENT);
    expect(USER_AGENT).toContain('balazs.apjok@gmail.com');
  });

  it('makes no request while the cached copy is younger than the minimum age', async () => {
    const s = fakeServer([{ status: 200, body: '[1]' }]);
    await fetchSource(source, dir, t0, s.impl);
    const again = await fetchSource(source, dir, later(3_599_000), s.impl);
    expect(again).toMatchObject({ body: '[1]', how: 'cache' });
    expect(s.requests).toHaveLength(1);
  });

  it('asks with If-None-Match when stale, and keeps the cached body on 304', async () => {
    const s = fakeServer([{ status: 200, body: '[1]', etag: '"abc"' }, { status: 304 }]);
    await fetchSource(source, dir, t0, s.impl);
    const again = await fetchSource(source, dir, later(3_600_001), s.impl);
    expect(s.requests[1]?.['If-None-Match']).toBe('"abc"');
    expect(again).toMatchObject({ body: '[1]', how: 'not-modified' });
  });

  it.each([403, 404, 301, 500])('HTTP %i stops at once: no retry, cache kept', async (status) => {
    const s = fakeServer([
      { status: 200, body: '[1]' },
      { status, body: 'GP data has not updated' },
    ]);
    await fetchSource(source, dir, t0, s.impl);
    await expect(fetchSource(source, dir, later(7_200_000), s.impl)).rejects.toThrow(SourceError);
    expect(s.requests).toHaveLength(2);
    expect(await readFile(join(dir, 'x.json'), 'utf8')).toBe('[1]');
  });

  it('build: an error in a later source writes nothing and asks no further source', async () => {
    const out = join(dir, 'out');
    const answers = [
      { status: 200, body: await fixture('gp-sample.json') },
      { status: 403, body: 'blocked' },
    ];
    const s = fakeServer(answers);
    await expect(
      build({ cacheDir: join(dir, 'cache'), contentDir, outDir: out }, t0, s.impl, () => {}),
    ).rejects.toThrow(/HTTP 403/);
    expect(s.requests).toHaveLength(2);
    await expect(readFile(join(out, 'meta.json'), 'utf8')).rejects.toThrow();
  });

  it('build: a full run on the samples writes valid files, debris included', async () => {
    const out = join(dir, 'out');
    const s = fakeServer([
      { status: 200, body: await fixture('gp-sample.json') },
      { status: 200, body: await fixture('satcat-sample.json') },
      { status: 200, body: await fixture('gcat-sample.tsv') },
      { status: 200, body: await fixture('gcat-orgs-sample.tsv') },
      // The debris clouds, in content/debris-clouds.json order
      { status: 200, body: await fixture('gp-debris-fengyun-sample.json') },
      { status: 200, body: '[]' },
      { status: 200, body: '[]' },
    ]);
    const meta = await build(
      { cacheDir: join(dir, 'cache'), contentDir, outDir: out },
      new Date('2026-10-11T12:00:00Z'),
      s.impl,
      () => {},
    );
    expect(meta.counts).toEqual({ objects: 5, withGcat: 4, debris: 2 });
    expect(meta.sources.gp.url).toBe(SOURCES.gp.url);
    const elements = elementsFileSchema.parse(
      JSON.parse(await readFile(join(out, 'elements.json'), 'utf8')),
    );
    const catalog = catalogFileSchema.parse(
      JSON.parse(await readFile(join(out, 'catalog.json'), 'utf8')),
    );
    expect(elements.rows).toHaveLength(7);
    expect(catalog.entries).toHaveLength(7);
    // Close approaches were computed too (none under 1 km among these 7 objects).
    expect(
      encountersFileSchema.parse(JSON.parse(await readFile(join(out, 'encounters.json'), 'utf8')))
        .thresholdKm,
    ).toBe(1);
  });
});

describe('objects SGP4 cannot propagate (SPEC.md 6.1 step 6)', () => {
  it('are left out and listed with the reason', async () => {
    const merged = await mergeFixtures();
    // Make the ISS's element set impossible: mean motion 16 rev/day (a ≈ 6,640 km)
    // with e = 0.99 puts the perigee thousands of km underground.
    const broken = {
      ...merged,
      rows: merged.rows.map((r) =>
        r[0] === 25544
          ? ([r[0], r[1], 16, 0.99, r[4], r[5], r[6], r[7], r[8], r[9], r[10]] as typeof r)
          : r,
      ),
    };
    const out = dropUnpropagatable(broken, Date.parse('2026-10-11T12:00:00Z'));
    expect(out.rows.map((r) => r[0])).not.toContain(25544);
    expect(out.entries.map((e) => e.norad)).not.toContain(25544);
    expect(out.skipped).toContainEqual(
      expect.objectContaining({ norad: 25544, name: 'ISS (ZARYA)' }),
    );
    expect(out.skipped.find((s) => s.norad === 25544)?.reason).toMatch(/^SGP4/);
  });

  it('every object of the samples propagates', async () => {
    const merged = await mergeFixtures();
    expect(dropUnpropagatable(merged, Date.parse('2026-10-11T12:00:00Z')).skipped).toEqual([]);
  });
});
