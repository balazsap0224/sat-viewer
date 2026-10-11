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
