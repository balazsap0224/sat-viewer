// Schemas for the hand-written tables in content/ (CLAUDE.md rule 5).

import { z } from 'zod';

/** content/owners.json: CelesTrak owner code → readable name and flag. */
export const ownersSchema = z.record(
  z.string(),
  z.object({
    name: z.string(),
    /** ISO 3166-1 alpha-2 code for the flag ("EU" for European bodies), null for none */
    country: z.string().length(2).nullable(),
    kind: z.enum(['country', 'organisation', 'multinational', 'unknown']),
  }),
);
export type Owners = z.infer<typeof ownersSchema>;

/** content/launch-sites.json: CelesTrak launch site code → name and approximate position. */
export const launchSitesSchema = z.record(
  z.string(),
  z.object({
    name: z.string(),
    latDeg: z.number().min(-90).max(90).nullable(),
    lonDeg: z.number().min(-180).max(180).nullable(),
  }),
);
export type LaunchSites = z.infer<typeof launchSitesSchema>;

/**
 * content/constellations.json: the first constellation whose name pattern matches the
 * object name wins (case-insensitive regular expression).
 */
export const constellationsSchema = z.array(
  z.object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string(),
    /** Regular expression matched against the CelesTrak object name */
    namePattern: z.string(),
  }),
);
export type Constellations = z.infer<typeof constellationsSchema>;

/**
 * content/object-notes.json: a short note shown on the info card of a few objects, where a
 * catalog value would mislead (NORAD number → text).
 */
export const objectNotesSchema = z.record(z.string().regex(/^\d+$/), z.string());
export type ObjectNotes = z.infer<typeof objectNotesSchema>;

/**
 * content/debris-clouds.json: the debris clouds CelesTrak publishes as GP groups (SPEC.md 4.1).
 * The fragments have no SATCAT or GCAT details of their own here; the owner, launch and story
 * come from the parent satellite.
 */
export const debrisCloudsSchema = z.array(
  z.object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    /** CelesTrak GP group (gp.php?GROUP=…) */
    group: z.string().regex(/^[a-z0-9-]+$/),
    /** Parent satellite */
    name: z.string(),
    /** CelesTrak owner code of the parent (content/owners.json) */
    ownerCode: z.string(),
    /** Parent's launch, YYYY-MM-DD, and CelesTrak launch site code */
    launchDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    launchSite: z.string(),
    /** One or two sentences for the info card */
    event: z.string(),
  }),
);
export type DebrisClouds = z.infer<typeof debrisCloudsSchema>;

/**
 * content/stat-groups.json: the country groups of the statistics (SPEC.md 4.5). A payload
 * belongs to the first group listing its country: GCAT's State code, resolved to the country
 * GCAT's organisation table gives for it (HK → CN, ESIB → E). Anything else is `otherLabel`.
 */
export const statGroupsSchema = z.object({
  groups: z.array(
    z.object({
      id: z.string().regex(/^[a-z0-9-]+$/),
      label: z.string(),
      /** GCAT country codes (orgs.tsv StateCode) */
      states: z.array(z.string()).min(1),
    }),
  ),
  otherLabel: z.string(),
});
export type StatGroups = z.infer<typeof statGroupsSchema>;
