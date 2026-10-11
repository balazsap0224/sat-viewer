// Schemas for what the data sources send (SPEC.md 4). The data job validates every record
// against these before using it; a record that fails stops the job (SPEC.md 4.3).
//
// `.loose()` keeps fields we do not use, so a source adding a field does not break the job;
// a field we use that is missing or of the wrong type does.

import { z } from 'zod';

/**
 * One CelesTrak GP record in OMM JSON (gp.php?FORMAT=JSON), CCSDS 502.0-B-3 keywords.
 * Units: MEAN_MOTION rev/day; angles degrees; BSTAR 1/Earth radii; MEAN_MOTION_DOT rev/day²
 * (already halved, as in a TLE), MEAN_MOTION_DDOT rev/day³ (already divided by 6).
 * EPOCH is UTC without a time zone suffix, e.g. "2026-10-11T03:12:45.123456".
 */
export const ommRecordSchema = z
  .object({
    OBJECT_NAME: z.string(),
    OBJECT_ID: z.string(),
    EPOCH: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/),
    MEAN_MOTION: z.number().positive(),
    ECCENTRICITY: z.number().min(0).lt(1),
    INCLINATION: z.number().min(0).max(180),
    RA_OF_ASC_NODE: z.number().min(0).max(360),
    ARG_OF_PERICENTER: z.number().min(0).max(360),
    MEAN_ANOMALY: z.number().min(0).max(360),
    EPHEMERIS_TYPE: z.number().int(),
    CLASSIFICATION_TYPE: z.string(),
    NORAD_CAT_ID: z.number().int().positive(),
    ELEMENT_SET_NO: z.number().int(),
    REV_AT_EPOCH: z.number().int(),
    BSTAR: z.number(),
    MEAN_MOTION_DOT: z.number(),
    MEAN_MOTION_DDOT: z.number(),
  })
  .loose();
export type OmmRecord = z.infer<typeof ommRecordSchema>;

/** One CelesTrak SATCAT record (satcat/records.php?FORMAT=JSON); see satcat-format.php. */
export const satcatRecordSchema = z
  .object({
    OBJECT_NAME: z.string(),
    OBJECT_ID: z.string(),
    NORAD_CAT_ID: z.number().int().positive(),
    /** PAY, R/B, DEB or UNK */
    OBJECT_TYPE: z.string(),
    /** + operational, - nonoperational, P partially, B backup, S spare, X extended, D decayed, ? unknown */
    OPS_STATUS_CODE: z.string().nullable(),
    OWNER: z.string(),
    LAUNCH_DATE: z.string().nullable(),
    LAUNCH_SITE: z.string().nullable(),
    DECAY_DATE: z.string().nullable(),
    PERIOD: z.number().nullable(),
    INCLINATION: z.number().nullable(),
    APOGEE: z.number().nullable(),
    PERIGEE: z.number().nullable(),
    RCS: z.number().nullable(),
  })
  .loose();
export type SatcatRecord = z.infer<typeof satcatRecordSchema>;
