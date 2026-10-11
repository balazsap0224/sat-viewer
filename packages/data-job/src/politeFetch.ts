// Polite downloading (SPEC.md 4.3, CLAUDE.md rule 8).
//
// - Each source has a minimum age: while the cached copy is younger, no request is made.
// - When it is older, one request is made, with If-None-Match / If-Modified-Since, so an
//   unchanged file costs the server a 304 and no body.
// - Every request names the project and a contact address in the User-Agent.
// - Anything other than 200 or 304 throws: the job stops, the old files stay, the workflow
//   run fails and the owner gets an email. There is no retry, ever: CelesTrak firewalls an
//   address after 50 errors in 2 hours, and answers a repeat download of unchanged data
//   with 403.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const USER_AGENT =
  'SatViewer-data-job/0.1 (static satellite viewer; contact: balazs.apjok@gmail.com)';

export interface Source {
  /** File name in the cache directory */
  readonly name: string;
  readonly url: string;
  /** Do not ask the server again until the cached copy is this old [ms] */
  readonly minAgeMs: number;
}

interface CacheMeta {
  readonly url: string;
  /** When the body was last confirmed current (200 or 304), ISO 8601 */
  readonly fetchedAt: string;
  readonly etag?: string;
  readonly lastModified?: string;
}

export interface Fetched {
  readonly body: string;
  readonly fetchedAt: string;
  /** What happened: no request (cache fresh), 304 (unchanged), or 200 (new body) */
  readonly how: 'cache' | 'not-modified' | 'downloaded';
}

export type FetchLike = (
  url: string,
  init: { headers: Record<string, string> },
) => Promise<{
  readonly status: number;
  readonly statusText: string;
  readonly headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

export class SourceError extends Error {
  override readonly name = 'SourceError';
}

async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

/** Writes via a temporary file and a rename, so a crash never leaves half a file. */
export async function writeAtomic(path: string, content: string): Promise<void> {
  await writeFile(`${path}.tmp`, content);
  await rename(`${path}.tmp`, path);
}

export async function fetchSource(
  source: Source,
  cacheDir: string,
  now: Date,
  fetchImpl: FetchLike,
): Promise<Fetched> {
  await mkdir(cacheDir, { recursive: true });
  const bodyPath = join(cacheDir, source.name);
  const metaPath = join(cacheDir, `${source.name}.meta.json`);
  const meta = await readJson<CacheMeta>(metaPath);
  let cached: string | undefined;
  try {
    cached = meta?.url === source.url ? await readFile(bodyPath, 'utf8') : undefined;
  } catch {
    cached = undefined;
  }

  if (meta && cached !== undefined) {
    const age = now.getTime() - Date.parse(meta.fetchedAt);
    if (age < source.minAgeMs) return { body: cached, fetchedAt: meta.fetchedAt, how: 'cache' };
  }

  const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
  if (cached !== undefined && meta?.etag) headers['If-None-Match'] = meta.etag;
  if (cached !== undefined && meta?.lastModified) headers['If-Modified-Since'] = meta.lastModified;

  const res = await fetchImpl(source.url, { headers });
  const fetchedAt = now.toISOString();

  if (res.status === 304 && cached !== undefined && meta) {
    await writeAtomic(metaPath, JSON.stringify({ ...meta, fetchedAt }, null, 2));
    return { body: cached, fetchedAt, how: 'not-modified' };
  }
  if (res.status !== 200) {
    // Read the body for the message (CelesTrak explains its 403s there), then stop.
    const text = (await res.text().catch(() => '')).slice(0, 300);
    throw new SourceError(
      `${source.url} answered HTTP ${res.status} ${res.statusText}. Stopping without retry; ` +
        `the previous data files are kept.${text ? ` Server said: ${text}` : ''}`,
    );
  }

  const body = await res.text();
  const etag = res.headers.get('etag');
  const lastModified = res.headers.get('last-modified');
  await writeAtomic(bodyPath, body);
  const newMeta: CacheMeta = {
    url: source.url,
    fetchedAt,
    ...(etag ? { etag } : {}),
    ...(lastModified ? { lastModified } : {}),
  };
  await writeAtomic(metaPath, JSON.stringify(newMeta, null, 2));
  return { body, fetchedAt, how: 'downloaded' };
}
