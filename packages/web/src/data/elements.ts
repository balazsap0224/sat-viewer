// Element rows (data/elements.json) → SGP4 records.

import { type SatRec, satrecFromElements } from '@sat-viewer/core';
import type { ElementRow } from '@sat-viewer/shared';

export function satrecFromRow(r: ElementRow): SatRec {
  return satrecFromElements({
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
  });
}
