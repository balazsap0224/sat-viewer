// Loading the data files the data job wrote (SPEC.md 5) and checking them on arrival.

import { orbitClass, type OrbitClass } from '@sat-viewer/core';
import {
  type CatalogEntry,
  catalogFileSchema,
  type ElementsFile,
  elementsFileSchema,
  type MetaFile,
  metaFileSchema,
} from '@sat-viewer/shared';
import { useEffect, useState } from 'react';
import type { z } from 'zod';

export interface SatData {
  readonly elements: ElementsFile;
  /** Catalog entries in the same order as elements.rows */
  readonly catalog: readonly (CatalogEntry | undefined)[];
  /** Orbit class per row (SPEC.md 6.3), in the same order */
  readonly classes: readonly OrbitClass[];
  /** NORAD number → row index */
  readonly indexOf: ReadonlyMap<number, number>;
  /** 1 for debris fragments (content/debris-clouds.json), same order */
  readonly debris: Uint8Array;
  readonly meta: MetaFile;
}

async function getJson<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  const result = schema.safeParse(await res.json());
  if (!result.success)
    throw new Error(`${path}: unexpected format (${result.error.issues[0]?.message ?? ''})`);
  return result.data;
}

export async function loadData(base = '/data'): Promise<SatData> {
  const [elements, catalogFile, meta] = await Promise.all([
    getJson(`${base}/elements.json`, elementsFileSchema),
    getJson(`${base}/catalog.json`, catalogFileSchema),
    getJson(`${base}/meta.json`, metaFileSchema),
  ]);
  const byNorad = new Map(catalogFile.entries.map((e) => [e.norad, e]));
  return {
    elements,
    catalog: elements.rows.map((r) => byNorad.get(r[0])),
    classes: elements.rows.map((r) => orbitClass(r[2], r[3], r[4])),
    indexOf: new Map(elements.rows.map((r, i) => [r[0], i])),
    debris: Uint8Array.from(elements.rows, (r) => (byNorad.get(r[0])?.debrisCloud ? 1 : 0)),
    meta,
  };
}

export type DataState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly data: SatData };

/** React hook: loads the data once. */
export function useSatData(): DataState {
  const [state, setState] = useState<DataState>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    loadData().then(
      (data) => !cancelled && setState({ status: 'ready', data }),
      (e: unknown) => !cancelled && setState({ status: 'error', message: (e as Error).message }),
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
