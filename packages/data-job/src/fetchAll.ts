// Downloads (or reuses) every source, one after the other. The first failure stops the run:
// later sources are not even asked (SPEC.md 4.3).

import { type Fetched, type FetchLike, fetchSource } from './politeFetch';
import { SOURCES, type SourceId } from './sources';

export async function fetchAll(
  cacheDir: string,
  now: Date,
  fetchImpl: FetchLike,
  log: (line: string) => void = console.log,
): Promise<Record<SourceId, Fetched>> {
  const out: Partial<Record<SourceId, Fetched>> = {};
  for (const id of Object.keys(SOURCES) as SourceId[]) {
    const source = SOURCES[id];
    const result = await fetchSource(source, cacheDir, now, fetchImpl);
    log(`${id}: ${result.how} (${(result.body.length / 1e6).toFixed(2)} MB, ${result.fetchedAt})`);
    out[id] = result;
  }
  return out as Record<SourceId, Fetched>;
}
