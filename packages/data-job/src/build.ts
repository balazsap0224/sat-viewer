// One run of the data job (SPEC.md 4.3): fetch (politely) → validate → merge → check → write.
//
// Any error throws before anything is written, so the previous files stay in place. The
// three output files are written via temporary files and renamed one by one.

import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type CatalogFile,
  catalogFileSchema,
  constellationsSchema,
  DATA_FORMAT_VERSION,
  ELEMENT_COLUMNS,
  type ElementsFile,
  elementsFileSchema,
  launchSitesSchema,
  type MetaFile,
  metaFileSchema,
  ommRecordSchema,
  ownersSchema,
  satcatRecordSchema,
} from '@sat-viewer/shared';
import { z } from 'zod';
import { checkCount, checkEpochs } from './checks';
import { fetchAll } from './fetchAll';
import { gcatIndex, parseGcatOrgs, parseGcatSatcat } from './gcat';
import { merge } from './merge';
import { type FetchLike, writeAtomic } from './politeFetch';
import { SOURCES } from './sources';

export interface BuildPaths {
  readonly cacheDir: string;
  readonly contentDir: string;
  readonly outDir: string;
}

export class ValidationError extends Error {
  override readonly name = 'ValidationError';
}

/** Parses JSON text and validates it, naming the source and the first bad record. */
export function parseWith<T>(schema: z.ZodType<T>, text: string, what: string): T {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new ValidationError(`${what}: not valid JSON (${(e as Error).message})`);
  }
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new ValidationError(
      `${what}: does not match the expected format at ${issue?.path.join('.') ?? '?'}: ${issue?.message ?? ''}`,
    );
  }
  return result.data;
}

async function readPrevious(outDir: string): Promise<MetaFile | undefined> {
  try {
    return metaFileSchema.parse(JSON.parse(await readFile(join(outDir, 'meta.json'), 'utf8')));
  } catch {
    return undefined;
  }
}

export async function build(
  paths: BuildPaths,
  now: Date,
  fetchImpl: FetchLike,
  log: (line: string) => void = console.log,
): Promise<MetaFile> {
  const content = async <T>(schema: z.ZodType<T>, file: string) =>
    parseWith(schema, await readFile(join(paths.contentDir, file), 'utf8'), `content/${file}`);
  const owners = await content(ownersSchema, 'owners.json');
  const launchSites = await content(launchSitesSchema, 'launch-sites.json');
  const constellations = await content(constellationsSchema, 'constellations.json');

  const fetched = await fetchAll(paths.cacheDir, now, fetchImpl, log);

  const gp = parseWith(z.array(ommRecordSchema), fetched.gp.body, 'CelesTrak GP');
  const satcat = parseWith(z.array(satcatRecordSchema), fetched.satcat.body, 'CelesTrak SATCAT');
  const gcatObjects = parseGcatSatcat(fetched.gcat.body);
  const gcatOrgs = parseGcatOrgs(fetched.gcatOrgs.body);

  const merged = merge({
    gp,
    satcat,
    findGcat: gcatIndex(gcatObjects),
    gcatOrgs,
    owners,
    launchSites,
    constellations,
  });

  const previous = await readPrevious(paths.outDir);
  checkCount(merged.rows.length, previous?.counts.objects);
  checkEpochs(
    merged.rows.map((r) => r[1]),
    now,
  );

  const elements: ElementsFile = elementsFileSchema.parse({
    version: DATA_FORMAT_VERSION,
    fetchedAt: fetched.gp.fetchedAt,
    columns: [...ELEMENT_COLUMNS],
    rows: merged.rows,
  });
  const catalog: CatalogFile = catalogFileSchema.parse({
    version: DATA_FORMAT_VERSION,
    entries: merged.entries,
  });
  const meta: MetaFile = metaFileSchema.parse({
    version: DATA_FORMAT_VERSION,
    generatedAt: now.toISOString(),
    sources: {
      gp: { fetchedAt: fetched.gp.fetchedAt, url: SOURCES.gp.url, records: gp.length },
      satcat: {
        fetchedAt: fetched.satcat.fetchedAt,
        url: SOURCES.satcat.url,
        records: satcat.length,
      },
      gcat: {
        fetchedAt: fetched.gcat.fetchedAt,
        url: SOURCES.gcat.url,
        records: gcatObjects.length,
      },
    },
    counts: {
      objects: merged.rows.length,
      withGcat: merged.entries.filter((e) => e.gcat).length,
    },
    skipped: merged.skipped,
    unknownCodes: merged.unknownCodes,
  });

  await mkdir(paths.outDir, { recursive: true });
  // Compact JSON (no indentation): the host compresses it (SPEC.md 10).
  await writeAtomic(join(paths.outDir, 'elements.json'), JSON.stringify(elements));
  await writeAtomic(join(paths.outDir, 'catalog.json'), JSON.stringify(catalog));
  // meta.json last: it is what the next run compares against.
  await writeAtomic(join(paths.outDir, 'meta.json'), JSON.stringify(meta, null, 2));

  log(
    `wrote ${meta.counts.objects} objects (${meta.counts.withGcat} with GCAT details), ` +
      `${meta.skipped.length} skipped`,
  );
  if (meta.unknownCodes.owners.length || meta.unknownCodes.launchSites.length) {
    log(
      `note: codes missing from content/: owners ${meta.unknownCodes.owners.join(', ') || '-'}; ` +
        `launch sites ${meta.unknownCodes.launchSites.join(', ') || '-'}`,
    );
  }
  return meta;
}
