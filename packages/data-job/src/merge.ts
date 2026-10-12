// Merging the sources into the published files (SPEC.md 4, 5). Pure: no I/O, so it is tested
// with saved sample records.
//
// The GP data decides which objects are published (CelesTrak's "active" group: working
// payloads). SATCAT adds names, owner and launch details; GCAT adds operator, manufacturer,
// bus and mass where it knows the object; content/ turns codes into names.

import type {
  CatalogEntry,
  Constellations,
  DebrisClouds,
  ElementRow,
  LaunchSites,
  OmmRecord,
  Owners,
  SatcatRecord,
} from '@sat-viewer/shared';
import { propagateAt, satrecFromElements } from '@sat-viewer/core';
import type { GcatObject } from './gcat';

export interface MergeInput {
  readonly gp: readonly OmmRecord[];
  readonly satcat: readonly SatcatRecord[];
  readonly findGcat: (norad: number, cosparId: string) => GcatObject | undefined;
  readonly gcatOrgs: ReadonlyMap<string, string>;
  readonly owners: Owners;
  readonly launchSites: LaunchSites;
  readonly constellations: Constellations;
}

export interface MergeResult {
  readonly rows: ElementRow[];
  readonly entries: CatalogEntry[];
  readonly skipped: { norad: number; name: string; reason: string }[];
  readonly unknownCodes: { owners: string[]; launchSites: string[] };
}

const orNull = <T>(v: T | undefined | null | ''): T | null =>
  v === undefined || v === null || v === '' ? null : v;

/** The first constellation whose pattern matches the name, or null. */
export function constellationOf(name: string, constellations: Constellations): string | null {
  for (const c of constellations) {
    if (new RegExp(c.namePattern, 'i').test(name)) return c.id;
  }
  return null;
}

export function merge(input: MergeInput): MergeResult {
  const satcatById = new Map(input.satcat.map((s) => [s.NORAD_CAT_ID, s]));
  const rows: ElementRow[] = [];
  const entries: CatalogEntry[] = [];
  const skipped: MergeResult['skipped'] = [];
  const unknownOwners = new Set<string>();
  const unknownSites = new Set<string>();
  const seen = new Set<number>();

  for (const gp of input.gp) {
    const norad = gp.NORAD_CAT_ID;
    if (seen.has(norad)) {
      skipped.push({ norad, name: gp.OBJECT_NAME, reason: 'duplicate element set' });
      continue;
    }
    seen.add(norad);
    const sc = satcatById.get(norad);
    if (!sc) {
      skipped.push({ norad, name: gp.OBJECT_NAME, reason: 'no SATCAT record' });
      continue;
    }
    if (orNull(sc.DECAY_DATE)) {
      skipped.push({ norad, name: gp.OBJECT_NAME, reason: `decayed ${sc.DECAY_DATE}` });
      continue;
    }

    rows.push([
      norad,
      gp.EPOCH,
      gp.MEAN_MOTION,
      gp.ECCENTRICITY,
      gp.INCLINATION,
      gp.RA_OF_ASC_NODE,
      gp.ARG_OF_PERICENTER,
      gp.MEAN_ANOMALY,
      gp.BSTAR,
      gp.MEAN_MOTION_DOT,
      gp.MEAN_MOTION_DDOT,
    ]);

    if (!(sc.OWNER in input.owners)) unknownOwners.add(sc.OWNER);
    const site = orNull(sc.LAUNCH_SITE);
    if (site && !(site in input.launchSites)) unknownSites.add(site);

    const g = input.findGcat(norad, gp.OBJECT_ID);
    const org = (code: string | undefined) =>
      // GCAT marks an uncertain attribution with a trailing "?" ("DKJ?").
      code === undefined
        ? null
        : (input.gcatOrgs.get(code) ?? input.gcatOrgs.get(code.replace(/\?$/, '')) ?? code);
    entries.push({
      norad,
      // The GP name is the most recently maintained one (SATCAT's agrees in nearly all cases).
      name: gp.OBJECT_NAME,
      cosparId: gp.OBJECT_ID,
      ownerCode: sc.OWNER,
      objectType: sc.OBJECT_TYPE,
      opsStatus: orNull(sc.OPS_STATUS_CODE),
      launchDate: orNull(sc.LAUNCH_DATE),
      launchSite: site,
      constellation: constellationOf(gp.OBJECT_NAME, input.constellations),
      debrisCloud: null,
      gcat: g
        ? {
            operator: org(g.owner),
            manufacturer: org(g.manufacturer),
            bus: orNull(g.bus),
            massKg: orNull(g.massKg),
            massEstimated: g.massEstimated,
            altName: orNull(g.plName),
          }
        : null,
    });
  }

  return {
    rows,
    entries,
    skipped,
    unknownCodes: { owners: [...unknownOwners].sort(), launchSites: [...unknownSites].sort() },
  };
}

/**
 * Leaves out objects SGP4 cannot propagate at time t (SPEC.md 6.1 step 6), so the site never
 * has to draw them. They are listed in meta.json with the reason. The site still checks every
 * position at runtime, since an object can fail later in the ±7 day window.
 */
export function dropUnpropagatable(result: MergeResult, t: number): MergeResult {
  const failed = new Map<number, string>();
  for (const row of result.rows) {
    const [
      norad,
      EPOCH,
      MEAN_MOTION,
      ECCENTRICITY,
      INCLINATION,
      RA_OF_ASC_NODE,
      ARG_OF_PERICENTER,
      MEAN_ANOMALY,
      BSTAR,
      MEAN_MOTION_DOT,
      MEAN_MOTION_DDOT,
    ] = row;
    let s: ReturnType<typeof propagateAt>;
    try {
      s = propagateAt(
        satrecFromElements({
          NORAD_CAT_ID: norad,
          EPOCH,
          MEAN_MOTION,
          ECCENTRICITY,
          INCLINATION,
          RA_OF_ASC_NODE,
          ARG_OF_PERICENTER,
          MEAN_ANOMALY,
          BSTAR,
          MEAN_MOTION_DOT,
          MEAN_MOTION_DDOT,
        }),
        t,
      );
    } catch (e) {
      failed.set(norad, `SGP4 initialisation failed: ${(e as Error).message}`);
      continue;
    }
    if (!s.ok) failed.set(norad, `SGP4: ${s.failure}`);
  }
  if (failed.size === 0) return result;
  const names = new Map(result.entries.map((e) => [e.norad, e.name]));
  return {
    ...result,
    rows: result.rows.filter((r) => !failed.has(r[0])),
    entries: result.entries.filter((e) => !failed.has(e.norad)),
    skipped: [
      ...result.skipped,
      ...[...failed].map(([norad, reason]) => ({ norad, name: names.get(norad) ?? '', reason })),
    ],
  };
}

/**
 * Adds one debris cloud's fragments (its CelesTrak GP group) to a merge result. Fragments have
 * no SATCAT or GCAT details here: owner and launch are the parent's (content/debris-clouds.json),
 * the type is "DEB". Objects already published (the same number in another group) are skipped.
 */
export function mergeDebris(
  result: MergeResult,
  gp: readonly OmmRecord[],
  cloud: DebrisClouds[number],
): MergeResult {
  const seen = new Set(result.rows.map((r) => r[0]));
  const rows = [...result.rows];
  const entries = [...result.entries];
  const skipped = [...result.skipped];
  for (const g of gp) {
    if (seen.has(g.NORAD_CAT_ID)) {
      skipped.push({ norad: g.NORAD_CAT_ID, name: g.OBJECT_NAME, reason: 'duplicate element set' });
      continue;
    }
    seen.add(g.NORAD_CAT_ID);
    rows.push([
      g.NORAD_CAT_ID,
      g.EPOCH,
      g.MEAN_MOTION,
      g.ECCENTRICITY,
      g.INCLINATION,
      g.RA_OF_ASC_NODE,
      g.ARG_OF_PERICENTER,
      g.MEAN_ANOMALY,
      g.BSTAR,
      g.MEAN_MOTION_DOT,
      g.MEAN_MOTION_DDOT,
    ]);
    entries.push({
      norad: g.NORAD_CAT_ID,
      name: g.OBJECT_NAME,
      cosparId: g.OBJECT_ID,
      ownerCode: cloud.ownerCode,
      objectType: 'DEB',
      opsStatus: null,
      launchDate: cloud.launchDate,
      launchSite: cloud.launchSite,
      constellation: null,
      debrisCloud: cloud.id,
      gcat: null,
    });
  }
  return { ...result, rows, entries, skipped };
}
