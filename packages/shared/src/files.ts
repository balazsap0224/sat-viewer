// Schemas for the data files the job writes and the site reads (SPEC.md 5). The job
// validates its output against these before publishing; the site validates on load.

import { z } from 'zod';

export const DATA_FORMAT_VERSION = 1;

/**
 * Orbital elements, compact: one row per object, columns in `ELEMENT_COLUMNS` order. Same
 * content as CelesTrak's OMM, without repeating field names 15,000 times (SPEC.md 10: first
 * load under ~3 MB compressed). The epoch stays the source's ISO text, so nothing is rounded.
 */
export const ELEMENT_COLUMNS = [
  'NORAD_CAT_ID',
  'EPOCH',
  'MEAN_MOTION',
  'ECCENTRICITY',
  'INCLINATION',
  'RA_OF_ASC_NODE',
  'ARG_OF_PERICENTER',
  'MEAN_ANOMALY',
  'BSTAR',
  'MEAN_MOTION_DOT',
  'MEAN_MOTION_DDOT',
] as const;

export const elementRowSchema = z.tuple([
  z.number().int().positive(),
  z.string(),
  z.number().positive(),
  z.number().min(0).lt(1),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
]);
export type ElementRow = z.infer<typeof elementRowSchema>;

export const elementsFileSchema = z.object({
  version: z.literal(DATA_FORMAT_VERSION),
  /** When the elements were downloaded from CelesTrak (ISO 8601 UTC) */
  fetchedAt: z.string(),
  columns: z
    .array(z.string())
    .refine(
      (c) =>
        c.length === ELEMENT_COLUMNS.length && c.every((name, i) => name === ELEMENT_COLUMNS[i]),
      'unexpected element columns',
    ),
  rows: z.array(elementRowSchema),
});
export type ElementsFile = z.infer<typeof elementsFileSchema>;

/** Merged metadata for one object (CelesTrak SATCAT + GCAT + content tables). */
export const catalogEntrySchema = z.object({
  norad: z.number().int().positive(),
  name: z.string(),
  /** International (COSPAR) designator, e.g. "1998-067A" */
  cosparId: z.string(),
  /** CelesTrak owner code (content/owners.json) */
  ownerCode: z.string(),
  /** PAY, R/B, DEB, UNK */
  objectType: z.string(),
  /** CelesTrak operational status code (+, -, P, B, S, X, D, ?) */
  opsStatus: z.string().nullable(),
  /** YYYY-MM-DD */
  launchDate: z.string().nullable(),
  /** CelesTrak launch site code (content/launch-sites.json) */
  launchSite: z.string().nullable(),
  /** Constellation id (content/constellations.json), if any */
  constellation: z.string().nullable(),
  /** Debris cloud id (content/debris-clouds.json) for debris fragments, else null */
  debrisCloud: z.string().nullable().default(null),
  /** From GCAT, where known */
  gcat: z
    .object({
      /** Operator / owner organisation (GCAT org code resolved to its name) */
      operator: z.string().nullable(),
      manufacturer: z.string().nullable(),
      bus: z.string().nullable(),
      /** Mass at orbital insertion [kg] */
      massKg: z.number().nullable(),
      /** True when GCAT marks the mass as an estimate (about ±20 %) */
      massEstimated: z.boolean(),
      /** Pre-launch or alternative name */
      altName: z.string().nullable(),
    })
    .nullable(),
});
export type CatalogEntry = z.infer<typeof catalogEntrySchema>;

export const catalogFileSchema = z.object({
  version: z.literal(DATA_FORMAT_VERSION),
  entries: z.array(catalogEntrySchema),
});
export type CatalogFile = z.infer<typeof catalogFileSchema>;

export const sourceMetaSchema = z.object({
  /** When the source was last downloaded (ISO 8601 UTC) */
  fetchedAt: z.string(),
  url: z.string(),
  records: z.number().int().nonnegative(),
});

export const metaFileSchema = z.object({
  version: z.literal(DATA_FORMAT_VERSION),
  generatedAt: z.string(),
  sources: z.object({ gp: sourceMetaSchema, satcat: sourceMetaSchema, gcat: sourceMetaSchema }),
  counts: z.object({
    /** Objects in the published files */
    objects: z.number().int().nonnegative(),
    /** Of those, with GCAT details */
    withGcat: z.number().int().nonnegative(),
    /** Debris fragments published besides the active satellites (not part of `objects`) */
    debris: z.number().int().nonnegative().default(0),
  }),
  /** Objects left out, and why (shown on the About page) */
  skipped: z.array(z.object({ norad: z.number().int(), name: z.string(), reason: z.string() })),
  /**
   * Owner and launch-site codes missing from content/ (the site shows the bare code). Not an
   * error, so a new country does not stop the scheduled job; the owner adds them by hand.
   */
  unknownCodes: z.object({ owners: z.array(z.string()), launchSites: z.array(z.string()) }),
});
export type MetaFile = z.infer<typeof metaFileSchema>;

/** Close approaches between published objects (core/encounters.ts, data-job/encounters.ts). */
export const encounterRowSchema = z.tuple([
  /** NORAD numbers of the two objects, a < b */
  z.number().int().positive(),
  z.number().int().positive(),
  /** Time of closest approach (Unix ms) */
  z.number().int(),
  /** Miss distance [km] */
  z.number().nonnegative(),
  /** Relative speed at closest approach [km/s] */
  z.number().nonnegative(),
]);
export type EncounterRow = z.infer<typeof encounterRowSchema>;

export const encountersFileSchema = z.object({
  version: z.literal(DATA_FORMAT_VERSION),
  computedAt: z.string(),
  /** The screened time span (ISO 8601 UTC) */
  from: z.string(),
  to: z.string(),
  thresholdKm: z.number().positive(),
  minRelSpeedKmS: z.number().nonnegative(),
  /** Closest first */
  rows: z.array(encounterRowSchema),
});
export type EncountersFile = z.infer<typeof encountersFileSchema>;

const yearCounts = z.array(z.number().int().nonnegative());

/**
 * Statistics by year from GCAT (SPEC.md 4.5, module 9). Every array has one value per entry
 * of `years`.
 */
export const statsFileSchema = z
  .object({
    version: z.literal(DATA_FORMAT_VERSION),
    /** When GCAT was downloaded (ISO 8601 UTC) */
    gcatFetchedAt: z.string(),
    /** 1957 to the current year, which is still running */
    years: z.array(z.number().int()),
    /** Orbital launches: launches that put at least one catalogued object in orbit */
    launches: yearCounts,
    /** Payloads launched, by country group (content/stat-groups.json, then "other") */
    payloads: z.array(z.object({ id: z.string(), label: z.string(), counts: yearCounts })),
    /** Objects in Earth orbit at the end of each year; for the current year, now */
    inOrbit: z.object({ payloads: yearCounts, stages: yearCounts, debris: yearCounts }),
  })
  .refine(
    (s) =>
      [
        s.launches,
        ...s.payloads.map((p) => p.counts),
        s.inOrbit.payloads,
        s.inOrbit.stages,
        s.inOrbit.debris,
      ].every((a) => a.length === s.years.length),
    { message: 'every series needs one value per year' },
  );
export type StatsFile = z.infer<typeof statsFileSchema>;
