// The downloads of a run (SPEC.md 4): the five below, plus one GP group per debris cloud in
// content/debris-clouds.json. At most one request each, and only when the cached copy is older
// than the source's minimum age (SPEC.md 4.3).
//
// The schedule (every 6 h) sets how often data is fetched; the minimum age only stops early
// repeats. It is the refresh interval minus SLACK, because GitHub often starts scheduled runs
// half an hour or more late (the 00:17 run on 13 October 2026 reached the data job at 00:48): with a
// 5.5-hour minimum, one late run makes the next, punctual one skip, and the orbits get 12 h
// old. Code pushes never fetch (main.ts, DATA_CACHED_ONLY).

import type { Source } from './politeFetch';

const HOUR = 3_600_000;
/** Half the 6-hour schedule: a run started up to 3 h late never makes the next one skip */
const SLACK = 3 * HOUR;

export const SOURCES = {
  /**
   * All active payloads, OMM JSON. Refreshed every 6 h. CelesTrak updates every 2 h, so 3 h
   * never asks for data that cannot have changed.
   */
  gp: {
    name: 'gp-active.json',
    url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=JSON',
    minAgeMs: 6 * HOUR - SLACK,
  },
  /** SATCAT records of the same group: names, owner, launch date and site. Daily [PROPOSED]. */
  satcat: {
    name: 'satcat-active.json',
    url: 'https://celestrak.org/satcat/records.php?GROUP=active&FORMAT=JSON',
    minAgeMs: 24 * HOUR - SLACK,
  },
  /** GCAT main catalog (J. McDowell, CC-BY 4.0): operator, manufacturer, bus, mass. Weekly. */
  gcat: {
    name: 'gcat-satcat.tsv',
    url: 'https://planet4589.org/space/gcat/tsv/cat/satcat.tsv',
    minAgeMs: 7 * 24 * HOUR - SLACK,
  },
  /**
   * GCAT's catalog of objects with 6-digit catalog numbers (launched since July 2026, when the
   * 5-digit numbers ran out): GCAT details for those objects, and the statistics. Weekly.
   */
  gcat100k: {
    name: 'gcat-satcat100k.tsv',
    url: 'https://planet4589.org/space/gcat/tsv/cat/satcat100k.tsv',
    minAgeMs: 7 * 24 * HOUR - SLACK,
  },
  /** GCAT organisation table: org code → name (for operator and manufacturer). Weekly. */
  gcatOrgs: {
    name: 'gcat-orgs.tsv',
    url: 'https://planet4589.org/space/gcat/tsv/tables/orgs.tsv',
    minAgeMs: 7 * 24 * HOUR - SLACK,
  },
} as const satisfies Record<string, Source>;

export type SourceId = keyof typeof SOURCES;

/**
 * One debris cloud's GP group (content/debris-clouds.json), OMM JSON, refreshed like the active
 * satellites. CelesTrak publishes only a few such clouds; the full catalog (all debris and
 * rocket bodies) needs Space-Track, which SPEC.md 4.2 rules out.
 */
export const debrisSource = (group: string): Source => ({
  name: `gp-${group}.json`,
  url: `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=JSON`,
  minAgeMs: SOURCES.gp.minAgeMs,
});
