// Keeps the URL hash and the selection/filters in step (SPEC.md 7.2: shareable links).
// Opening a link applies its hash; changes write a new hash with history.replaceState (no
// new history entry per click); editing the hash by hand applies it again.

import { useEffect } from 'react';
import type { SatData } from '../data/load';
import { filtersStore } from './filters';
import { selection } from './selection';
import { formatHash, parseHash } from './urlState';

export function useUrlSync(data: SatData | undefined): void {
  useEffect(() => {
    if (!data) return;
    const apply = () => {
      const s = parseHash(window.location.hash);
      filtersStore.set(s.filters);
      // A NORAD number that is not in the data (decayed, or a typo) selects nothing.
      selection.select(s.sat !== null && data.indexOf.has(s.sat) ? s.sat : null);
    };
    const write = () => {
      const hash = formatHash({ sat: selection.get().selected, filters: filtersStore.get() });
      const url = `${window.location.pathname}${window.location.search}${hash ? `#${hash}` : ''}`;
      if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`)
        history.replaceState(null, '', url);
    };
    apply();
    write();
    window.addEventListener('hashchange', apply);
    const unsubs = [selection.subscribe(write), filtersStore.subscribe(write)];
    return () => {
      window.removeEventListener('hashchange', apply);
      for (const u of unsubs) u();
    };
  }, [data]);
}
