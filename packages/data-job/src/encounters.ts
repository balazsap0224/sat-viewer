// Close approaches for the site's "Closest meetings" panel (SPEC.md 7.2): screens every pair
// of published objects over the next ENCOUNTER_WINDOW_H hours from the element download time
// (core/encounters.ts) and writes encounters.json. No network: it reads the elements just
// built (or, with `pnpm encounters`, the published elements.json).

import { findEncounters, satrecFromElements } from '@sat-viewer/core';
import {
  DATA_FORMAT_VERSION,
  type ElementsFile,
  type EncountersFile,
  encountersFileSchema,
} from '@sat-viewer/shared';

/**
 * Hours screened from the elements' download time [PROPOSED]. The data refreshes every
 * 6 hours, so 48 hours always covers "the next 24 hours" with room for a late run.
 */
export const ENCOUNTER_WINDOW_H = 48;
/**
 * Report approaches closer than this [km] [PROPOSED]. The dense Starlink shells give about
 * 12,000 approaches under 10 km per hour (rate ∝ distance²), so 1 km keeps the file small
 * (about 100 per hour) and still lists every truly close meeting.
 */
export const ENCOUNTER_THRESHOLD_KM = 1;
/** Ignore pairs that move together (docked modules, formations, shared GEO slots) [PROPOSED] */
export const ENCOUNTER_MIN_REL_SPEED_KMS = 0.5;

/**
 * Close approaches between the published objects. Pairs of two debris fragments (`debris`) are
 * not screened: fragments of one cloud fly in similar orbits and would fill the list, and
 * nobody steers them.
 */
export function computeEncounters(
  elements: ElementsFile,
  debris: ReadonlySet<number>,
  log: (line: string) => void = console.log,
): EncountersFile {
  const objects = elements.rows.map((r) => ({
    id: r[0],
    passive: debris.has(r[0]),
    satrec: satrecFromElements({
      NORAD_CAT_ID: r[0],
      EPOCH: r[1],
      MEAN_MOTION: r[2],
      ECCENTRICITY: r[3],
      INCLINATION: r[4],
      RA_OF_ASC_NODE: r[5],
      ARG_OF_PERICENTER: r[6],
      MEAN_ANOMALY: r[7],
      BSTAR: r[8],
      MEAN_MOTION_DOT: r[9],
      MEAN_MOTION_DDOT: r[10],
    }),
  }));
  const from = Date.parse(elements.fetchedAt);
  const to = from + ENCOUNTER_WINDOW_H * 3_600_000;
  const started = Date.now();
  let shown = 0;
  const found = findEncounters(objects, from, to, {
    thresholdKm: ENCOUNTER_THRESHOLD_KM,
    minRelSpeedKmS: ENCOUNTER_MIN_REL_SPEED_KMS,
    onProgress: (f) => {
      if (f * 10 >= shown + 1) {
        shown = Math.floor(f * 10);
        log(`close approaches: ${shown * 10} % (${((Date.now() - started) / 1000).toFixed(0)} s)`);
      }
    },
  });
  log(`close approaches: ${found.length} under ${ENCOUNTER_THRESHOLD_KM} km`);
  return encountersFileSchema.parse({
    version: DATA_FORMAT_VERSION,
    computedAt: new Date().toISOString(),
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    thresholdKm: ENCOUNTER_THRESHOLD_KM,
    minRelSpeedKmS: ENCOUNTER_MIN_REL_SPEED_KMS,
    // Compact rows: [a, b, time (Unix ms), miss distance (km, 3 decimals), relative speed (km/s, 3 decimals)]
    rows: found.map((e) => [
      e.a,
      e.b,
      Math.round(e.t),
      Math.round(e.missKm * 1000) / 1000,
      Math.round(e.relSpeedKmS * 1000) / 1000,
    ]),
  });
}
