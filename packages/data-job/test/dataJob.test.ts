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
  statGroupsSchema,
  statsFileSchema,
} from '@sat-viewer/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { build, parseWith } from '../src/build';
import { checkCount, checkEpochs, SanityError } from '../src/checks';
import {
  gcatEndYear,
  gcatIndex,
  parseGcatOrgs,
  parseGcatSatcat,
  parseGcatStateCodes,
} from '../src/gcat';
import { dropUnpropagatable, merge, mergeDebris } from '../src/merge';
import { type FetchLike, fetchSource, SourceError, USER_AGENT } from '../src/politeFetch';
import { SOURCES } from '../src/sources';
import { computeStats } from '../src/stats';

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

// Module 9 reference values: PENDING OWNER VERIFICATION, see docs/verification/phase-5.md.
describe('statistics (module 9: the owner checks these values)', () => {
  async function early() {
    const groups = statGroupsSchema.parse(
      JSON.parse(await readFile(join(contentDir, 'stat-groups.json'), 'utf8')),
    );
    // Every object GCAT lists as launched in 1957 or 1958 (real rows, GCAT of 9 October 2026).
    const objects = parseGcatSatcat(await fixture('gcat-1957-1958.tsv'));
    return computeStats(objects, groups, new Map(), 2026, '2026-10-11T11:51:30.449Z');
  }
  const group = (s: Awaited<ReturnType<typeof early>>, id: string, year: number) =>
    s.payloads.find((p) => p.id === id)?.counts[s.years.indexOf(year)];

  it('[9.1] 1957: 2 launches (Sputnik 1 and 2), 2 Soviet payloads, both still in orbit at the end of the year', async () => {
    const s = await early();
    const i = s.years.indexOf(1957);
    expect(i).toBe(0);
    expect(s.launches[i]).toBe(2);
    expect(group(s, 'ru', 1957)).toBe(2);
    expect(group(s, 'us', 1957)).toBe(0);
    // Sputnik 1's rocket stage reentered on 1 December 1957, so no stage is left.
    expect([s.inOrbit.payloads[i], s.inOrbit.stages[i], s.inOrbit.debris[i]]).toEqual([2, 0, 0]);
  });

  it('[9.2] 1958: 8 launches (Pioneer 1 and 3 included), payloads US 7 and USSR 1; in orbit at the end: 5 payloads, 1 stage, 2 parts', async () => {
    const s = await early();
    const i = s.years.indexOf(1958);
    expect(s.launches[i]).toBe(8);
    expect(group(s, 'us', 1958)).toBe(7);
    expect(group(s, 'ru', 1958)).toBe(1);
    // Explorer 1, Vanguard 1, Sputnik 3, Explorer 4, SCORE; Vanguard's third stage; two
    // Vanguard parts. Sputnik 1 and 2, Explorer 3 and both Pioneers came down in 1958.
    expect([s.inOrbit.payloads[i], s.inOrbit.stages[i], s.inOrbit.debris[i]]).toEqual([5, 1, 2]);
  });

  it('[9.3] now (2026): of the 1957–58 objects, Vanguard 1, its third stage and two parts are still up', async () => {
    const s = await early();
    const i = s.years.indexOf(2026);
    expect([s.inOrbit.payloads[i], s.inOrbit.stages[i], s.inOrbit.debris[i]]).toEqual([1, 1, 2]);
    expect(s.launches[i]).toBe(0);
  });

  it('[9.4] end of a separate life in orbit: reentry, docking, grappling; not renaming, breakup, release or loss', () => {
    expect(gcatEndYear('1957 Dec  1 1000?', 'R')).toBe(1957);
    expect(gcatEndYear('1958 Apr 14 0200?', 'AR')).toBe(1958);
    expect(gcatEndYear('1966 Mar 16 2314:18', 'DK')).toBe(1966); // Gemini 8 docked with Agena
    expect(gcatEndYear('1998 Dec  6 2347:02', 'GRP')).toBe(1998); // Zarya grappled by the Shuttle
    expect(gcatEndYear('2026 Apr  3 1435', 'DSO')).toBe(2026); // Artemis II left for the Moon
    expect(gcatEndYear('2001 Jul 18', 'N')).toBeUndefined(); // Early Bird renamed, still up
    expect(gcatEndYear('1964 Nov  5 1030?', 'E')).toBeUndefined(); // broke up, goes on as debris
    expect(gcatEndYear('2006 Jul', 'REL')).toBeUndefined();
    expect(gcatEndYear('-', 'O')).toBeUndefined();
  });

  it('[9.5] country codes resolve through GCAT organisations: Hong Kong counts for China, the Balearic Islands for Europe', async () => {
    const groups = statGroupsSchema.parse(
      JSON.parse(await readFile(join(contentDir, 'stat-groups.json'), 'utf8')),
    );
    const states = parseGcatStateCodes('#Code\tStateCode\nHK\tCN\nESIB\tE\nCN\tCN\n');
    const sat = {
      kind: 'P',
      launchTag: '2020-001',
      launchYear: 2020,
      separationYear: 2020,
      endYear: undefined,
    };
    const s = computeStats(
      [
        { ...sat, state: 'HK' },
        { ...sat, state: 'ESIB' },
        { ...sat, state: 'TR' },
        { ...sat, state: undefined },
        { ...sat, kind: 'Z', state: 'CN' },
      ],
      groups,
      states,
      2020,
      '',
    );
    const at = (id: string) => s.payloads.find((p) => p.id === id)?.counts.at(-1);
    expect([at('cn'), at('eu'), at('other')]).toEqual([1, 1, 2]);
    expect(s.launches.at(-1)).toBe(1); // the spurious (Z) object is not counted
    expect(statsFileSchema.safeParse(s).success).toBe(true);
  });

  it('a GCAT date without a year stops the job', () => {
    const text =
      '#JCAT\tSatcat\tLaunch_Tag\tPiece\tType\tName\tPLName\tLDate\tSDate\tDDate\tStatus\tOwner\tState\tManufacturer\tBus\tMass\tMassFlag\nS1\t1\tX\tX\tP\tX\t-\tOct 1957\t-\t-\tO\t-\tSU\t-\t-\t-\t\n';
    expect(() => parseGcatSatcat(text)).toThrow(/does not start with a year/);
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

  it('cachedOnly (push runs): uses a cached copy however old, without a request', async () => {
    const s = fakeServer([{ status: 200, body: '[1]' }]);
    await fetchSource(source, dir, t0, s.impl);
    const again = await fetchSource(source, dir, later(30 * 86_400_000), s.impl, {
      cachedOnly: true,
    });
    expect(again).toMatchObject({ body: '[1]', how: 'cache', fetchedAt: t0.toISOString() });
    expect(s.requests).toHaveLength(1);
  });

  it('cachedOnly with nothing cached still downloads (first run, or the cache was evicted)', async () => {
    const s = fakeServer([{ status: 200, body: '[1]' }]);
    const first = await fetchSource(source, dir, t0, s.impl, { cachedOnly: true });
    expect(first).toMatchObject({ body: '[1]', how: 'downloaded' });
    expect(s.requests).toHaveLength(1);
  });

  it("orbit minimum age: at least CelesTrak's 2 h, and a run 3 h late never makes the next skip", () => {
    const hour = 3_600_000;
    expect(SOURCES.gp.minAgeMs).toBeGreaterThanOrEqual(2 * hour);
    // Run k starts 3 h late and fetches; run k + 1, on time, is 3 h later and must fetch too.
    expect(SOURCES.gp.minAgeMs).toBeLessThanOrEqual(6 * hour - 3 * hour);
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
      { status: 200, body: await fixture('gcat100k-sample.tsv') },
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
    // 100000 (Saramago) gets its GCAT details from satcat100k.tsv.
    expect(meta.counts).toEqual({ objects: 5, withGcat: 5, debris: 2 });
    expect(meta.sources.gp.url).toBe(SOURCES.gp.url);
    const elements = elementsFileSchema.parse(
      JSON.parse(await readFile(join(out, 'elements.json'), 'utf8')),
    );
    const catalog = catalogFileSchema.parse(
      JSON.parse(await readFile(join(out, 'catalog.json'), 'utf8')),
    );
    expect(elements.rows).toHaveLength(7);
    expect(catalog.entries).toHaveLength(7);
    const stats = statsFileSchema.parse(
      JSON.parse(await readFile(join(out, 'stats.json'), 'utf8')),
    );
    expect(stats.years.at(-1)).toBe(2026);
    // Saramago (Portugal), launched 30 March 2026, counts for Europe.
    const y2026 = stats.years.indexOf(2026);
    expect(stats.payloads.find((p) => p.id === 'eu')?.counts[y2026]).toBeGreaterThanOrEqual(1);
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
