// Search (SPEC.md 7.2): by name, NORAD catalog number or international (COSPAR) designator,
// with instant results. 17,000 names are few enough to scan on every keystroke (< 2 ms).
//
// Ranking, best first:
//   0  exact NORAD number, exact COSPAR designator, or exact name
//   1  name starts with the query ("STARLINK-1" → STARLINK-1007…)
//   2  a word of the name starts with it ("zarya" → ISS (ZARYA))
//   3  the name or the GCAT alternative name contains it
// Within a rank: shorter names first, then lower NORAD number (older objects).
// A query of digits only also matches NORAD numbers by prefix (rank 1).

import type { CatalogEntry } from '@sat-viewer/shared';

export interface SearchItem {
  readonly index: number;
  readonly norad: number;
  readonly name: string;
  readonly cosparId: string;
  readonly altName: string | null;
}

export interface SearchIndex {
  readonly items: readonly SearchItem[];
  /** Lower-case names, same order */
  readonly lower: readonly string[];
  readonly lowerAlt: readonly (string | null)[];
}

export function buildSearchIndex(
  norads: readonly number[],
  catalog: readonly (CatalogEntry | undefined)[],
): SearchIndex {
  const items = norads.map((norad, index) => {
    const e = catalog[index];
    return {
      index,
      norad,
      name: e?.name ?? String(norad),
      cosparId: e?.cosparId ?? '',
      altName: e?.gcat?.altName ?? null,
    };
  });
  return {
    items,
    lower: items.map((it) => it.name.toLowerCase()),
    lowerAlt: items.map((it) => it.altName?.toLowerCase() ?? null),
  };
}

const COSPAR = /^\d{4}-\d{0,3}[a-z]*$/;

function rank(q: string, idx: SearchIndex, i: number): number | undefined {
  const it = idx.items[i]!;
  const name = idx.lower[i]!;
  if (/^\d+$/.test(q)) {
    const n = String(it.norad);
    if (n === q) return 0;
    if (n.startsWith(q)) return 1;
  }
  if (COSPAR.test(q)) {
    const c = it.cosparId.toLowerCase();
    if (c === q) return 0;
    if (c.startsWith(q)) return 1;
  }
  if (name === q) return 0;
  if (name.startsWith(q)) return 1;
  // Word starts: after a space, bracket, hyphen or slash.
  if (
    name.includes(' ' + q) ||
    name.includes('(' + q) ||
    name.includes('-' + q) ||
    name.includes('/' + q)
  )
    return 2;
  if (name.includes(q)) return 3;
  if (idx.lowerAlt[i]?.includes(q)) return 3;
  return undefined;
}

/** Up to `limit` matches for the query, best first; empty for an empty query. */
export function search(idx: SearchIndex, query: string, limit = 10): SearchItem[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];
  const hits: { r: number; it: SearchItem }[] = [];
  for (let i = 0; i < idx.items.length; i++) {
    const r = rank(q, idx, i);
    if (r !== undefined) hits.push({ r, it: idx.items[i]! });
  }
  hits.sort((a, b) => a.r - b.r || a.it.name.length - b.it.name.length || a.it.norad - b.it.norad);
  return hits.slice(0, limit).map((h) => h.it);
}
