// One run of the data job (SPEC.md 4.3): fetch (politely) → validate → merge → check → write,
// then the close approaches between the published objects (encounters.ts).
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
  debrisCloudsSchema,
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
import { computeEncounters } from './encounters';
import { fetchAll } from './fetchAll';
import { gcatIndex, parseGcatOrgs, parseGcatSatcat } from './gcat';
import { dropUnpropagatable, merge, mergeDebris } from './merge';
import { type FetchLike, type FetchOptions, fetchSource, writeAtomic } from './politeFetch';
import { debrisSource, SOURCES } from './sources';

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
  fetchOptions: FetchOptions = {},
): Promise<MetaFile> {
  const content = async <T>(schema: z.ZodType<T>, file: string) =>
    parseWith(schema, await readFile(join(paths.contentDir, file), 'utf8'), `content/${file}`);
  const owners = await content(ownersSchema, 'owners.json');
  const launchSites = await content(launchSitesSchema, 'launch-sites.json');
  const constellations = await content(constellationsSchema, 'constellations.json');
  const debrisClouds = await content(debrisCloudsSchema, 'debris-clouds.json');

  const fetched = await fetchAll(paths.cacheDir, now, fetchImpl, log, fetchOptions);
  // One GP group per debris cloud, after the main sources (the first failure stops the run).
  const debrisFetched = [];
  for (const cloud of debrisClouds) {
    const source = debrisSource(cloud.group);
    const result = await fetchSource(source, paths.cacheDir, now, fetchImpl, fetchOptions);
    log(`debris ${cloud.id}: ${result.how} (${(result.body.length / 1e6).toFixed(2)} MB)`);
    debrisFetched.push({
      cloud,
      source,
      fetchedAt: result.fetchedAt,
      gp: parseWith(z.array(ommRecordSchema), result.body, `CelesTrak GP ${cloud.group}`),
    });
  }

  const gp = parseWith(z.array(ommRecordSchema), fetched.gp.body, 'CelesTrak GP');
  const satcat = parseWith(z.array(satcatRecordSchema), fetched.satcat.body, 'CelesTrak SATCAT');
  const gcatObjects = parseGcatSatcat(fetched.gcat.body);
  const gcatOrgs = parseGcatOrgs(fetched.gcatOrgs.body);

  const merged = dropUnpropagatable(
    debrisFetched.reduce(
      (m, d) => mergeDebris(m, d.gp, d.cloud),
      merge({
        gp,
        satcat,
        findGcat: gcatIndex(gcatObjects),
        gcatOrgs,
        owners,
        launchSites,
        constellations,
      }),
    ),
    now.getTime(),
  );
  const debrisCount = merged.entries.filter((e) => e.debrisCloud !== null).length;
  const activeCount = merged.rows.length - debrisCount;

  // Active satellites and debris are checked separately, so adding the debris clouds (or a
  // cloud slowly decaying) does not look like a broken download of the active group.
  const previous = await readPrevious(paths.outDir);
  checkCount(activeCount, previous?.counts.objects);
  if (debrisClouds.length > 0 && previous?.counts.debris)
    checkCount(debrisCount, previous.counts.debris);
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
      objects: activeCount,
      withGcat: merged.entries.filter((e) => e.gcat).length,
      debris: debrisCount,
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
  // Close approaches from the new elements (a few minutes; no network).
  await writeAtomic(
    join(paths.outDir, 'encounters.json'),
    JSON.stringify(
      computeEncounters(
        elements,
        new Set(catalog.entries.filter((e) => e.debrisCloud !== null).map((e) => e.norad)),
        log,
      ),
    ),
  );

  log(
    `wrote ${meta.counts.objects} objects (${meta.counts.withGcat} with GCAT details) and ` +
      `${meta.counts.debris} debris fragments, ` +
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
