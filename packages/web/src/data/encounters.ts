// The close approaches the data job computed (data/encounters.json, SPEC.md 7.2 "Closest
// meetings"). Loaded only when the panel is first opened; the file is optional, so a missing
// one (data job not run since this feature) only disables the panel.

import { type EncountersFile, encountersFileSchema } from '@sat-viewer/shared';
import { useEffect, useState } from 'react';

export type EncountersState =
  | { readonly status: 'idle' | 'loading' }
  | { readonly status: 'missing' | 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly file: EncountersFile };

let loading: Promise<EncountersState> | undefined;

function load(base = '/data'): Promise<EncountersState> {
  loading ??= (async (): Promise<EncountersState> => {
    try {
      const res = await fetch(`${base}/encounters.json`);
      if (res.status === 404) return { status: 'missing', message: 'not computed yet' };
      if (!res.ok) return { status: 'error', message: `HTTP ${res.status}` };
      const parsed = encountersFileSchema.safeParse(await res.json());
      if (!parsed.success) return { status: 'error', message: 'unexpected format' };
      return { status: 'ready', file: parsed.data };
    } catch (e) {
      // The dev server answers a missing file with the page itself: not JSON.
      return { status: 'missing', message: (e as Error).message };
    }
  })();
  return loading;
}

/** Loads encounters.json once `enabled` turns true; later calls share the same download. */
export function useEncounters(enabled: boolean): EncountersState {
  const [state, setState] = useState<EncountersState>({ status: 'idle' });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setState((s) => (s.status === 'idle' ? { status: 'loading' } : s));
    void load().then((s) => !cancelled && setState(s));
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return state;
}
