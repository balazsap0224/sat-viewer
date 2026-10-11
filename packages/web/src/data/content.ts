// The hand-written tables in content/ (CLAUDE.md rule 5), bundled into the site at build time
// and checked with the same schemas the data job uses.

import {
  constellationsSchema,
  launchSitesSchema,
  objectNotesSchema,
  ownersSchema,
} from '@sat-viewer/shared';
import constellationsJson from '../../../../content/constellations.json';
import launchSitesJson from '../../../../content/launch-sites.json';
import objectNotesJson from '../../../../content/object-notes.json';
import ownersJson from '../../../../content/owners.json';

export const OWNERS = ownersSchema.parse(ownersJson);
export const LAUNCH_SITES = launchSitesSchema.parse(launchSitesJson);
export const CONSTELLATIONS = constellationsSchema.parse(constellationsJson);
export const OBJECT_NOTES = objectNotesSchema.parse(objectNotesJson);

/** Readable owner name, or the bare CelesTrak code when content/owners.json lacks it. */
export const ownerName = (code: string): string => OWNERS[code]?.name ?? code;
