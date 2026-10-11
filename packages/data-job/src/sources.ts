// The four downloads of a run (SPEC.md 4). At most one request each, and only when the
// cached copy is older than the source's refresh interval (SPEC.md 4.3).

import type { Source } from './politeFetch';

const HOUR = 3_600_000;

export const SOURCES = {
  /** All active payloads, OMM JSON. CelesTrak updates every 2 h; we refresh every 6 h. */
  gp: {
    name: 'gp-active.json',
    url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=JSON',
    // A little under 6 h, so a run scheduled every 6 h is never skipped by a few seconds.
    minAgeMs: 5.5 * HOUR,
  },
  /** SATCAT records of the same group: names, owner, launch date and site. Daily [PROPOSED]. */
  satcat: {
    name: 'satcat-active.json',
    url: 'https://celestrak.org/satcat/records.php?GROUP=active&FORMAT=JSON',
    minAgeMs: 23 * HOUR,
  },
  /** GCAT main catalog (J. McDowell, CC-BY 4.0): operator, manufacturer, bus, mass. Weekly. */
  gcat: {
    name: 'gcat-satcat.tsv',
    url: 'https://planet4589.org/space/gcat/tsv/cat/satcat.tsv',
    minAgeMs: 7 * 24 * HOUR - HOUR,
  },
  /** GCAT organisation table: org code → name (for operator and manufacturer). Weekly. */
  gcatOrgs: {
    name: 'gcat-orgs.tsv',
    url: 'https://planet4589.org/space/gcat/tsv/tables/orgs.tsv',
    minAgeMs: 7 * 24 * HOUR - HOUR,
  },
} as const satisfies Record<string, Source>;

export type SourceId = keyof typeof SOURCES;
