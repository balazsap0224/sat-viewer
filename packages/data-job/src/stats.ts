// Statistics by year from GCAT (SPEC.md 4.5, module 9), for the Statistics page (module 10).
//
// Input: every row of GCAT's satcat.tsv and satcat100k.tsv (one row per catalogued object).
// Rows of kind Z (spurious or reassigned catalog entries) are left out everywhere.
//
// - Orbital launches in a year: distinct launch tags (COSPAR launch designations, which start
//   with the year) of that year, so launches that put at least one catalogued object in orbit.
//   Launch failures have no objects in these files. A tag is counted in its own year even
//   where GCAT dates some of its objects differently (debris found later, objects released
//   from the ISS, which keep its 1998 tag).
// - Payloads launched in a year (GCAT launch date), by country group (content/stat-groups.json).
// - Objects in Earth orbit at the end of a year: separate objects since that year or before,
//   and their end year (gcat.ts, gcatEndYear) after it. Payloads and rocket stages count from
//   their launch; debris and parts from their separation (a breakup can come decades after
//   the parent's launch). For the current year that is "now".

import type { StatGroups, StatsFile } from '@sat-viewer/shared';
import { DATA_FORMAT_VERSION } from '@sat-viewer/shared';
import type { GcatObject } from './gcat';

/** The first year with a satellite (Sputnik 1, 4 October 1957) */
export const FIRST_YEAR = 1957;

type StatsObject = Pick<
  GcatObject,
  'kind' | 'launchTag' | 'launchYear' | 'separationYear' | 'endYear' | 'state'
>;

export function computeStats(
  objects: readonly StatsObject[],
  groups: StatGroups,
  /** country code → the country it belongs to (gcat.ts, parseGcatStateCodes) */
  stateCodes: ReadonlyMap<string, string>,
  lastYear: number,
  gcatFetchedAt: string,
): StatsFile {
  const years = Array.from({ length: lastYear - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i);
  const zeros = () => years.map(() => 0);
  const index = (year: number) => year - FIRST_YEAR;

  const groupOf = new Map<string, number>();
  groups.groups.forEach((g, i) => g.states.forEach((s) => groupOf.set(s, i)));
  const other = groups.groups.length;
  const payloads = [...groups.groups, { id: 'other', label: groups.otherLabel }].map((g) => ({
    id: g.id,
    label: g.label,
    counts: zeros(),
  }));

  const launchTags = years.map(() => new Set<string>());
  const inOrbit = { payloads: zeros(), stages: zeros(), debris: zeros() };

  for (const o of objects) {
    if (o.kind === 'Z') continue;
    // A launch date after `lastYear` would be a data error; such rows are not counted.
    if (o.launchYear < FIRST_YEAR || o.launchYear > lastYear) continue;
    const y = index(o.launchYear);
    const tagYear = /^(\d{4})/.exec(o.launchTag)?.[1];
    if (tagYear) launchTags[index(Number(tagYear))]?.add(o.launchTag);

    if (o.kind === 'P') {
      const state = o.state === undefined ? undefined : (stateCodes.get(o.state) ?? o.state);
      const g = (state === undefined ? undefined : groupOf.get(state)) ?? other;
      const counts = payloads[g]?.counts;
      if (counts) counts[y] = (counts[y] ?? 0) + 1;
    }

    const series =
      o.kind === 'P' ? inOrbit.payloads : o.kind === 'R' ? inOrbit.stages : inOrbit.debris;
    // In orbit at the end of every year from the year it became a separate object up to the
    // year before it left.
    const first =
      o.kind === 'P' || o.kind === 'R'
        ? o.launchYear
        : Math.max(o.launchYear, o.separationYear ?? o.launchYear);
    const last = o.endYear === undefined ? lastYear : Math.min(o.endYear - 1, lastYear);
    for (let year = first; year <= last; year++) {
      const i = index(year);
      series[i] = (series[i] ?? 0) + 1;
    }
  }

  return {
    version: DATA_FORMAT_VERSION,
    gcatFetchedAt,
    years,
    launches: launchTags.map((s) => s.size),
    payloads,
    inOrbit,
  };
}
