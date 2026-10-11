// Merging the sources into the published files (SPEC.md 4, 5). Pure: no I/O, so it is tested
// with saved sample records.
//
// The GP data decides which objects are published (CelesTrak's "active" group: working
// payloads). SATCAT adds names, owner and launch details; GCAT adds operator, manufacturer,
// bus and mass where it knows the object; content/ turns codes into names.

import type {
  CatalogEntry,
  Constellations,
  ElementRow,
  LaunchSites,
  OmmRecord,
  Owners,
  SatcatRecord,
} from '@sat-viewer/shared';
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
