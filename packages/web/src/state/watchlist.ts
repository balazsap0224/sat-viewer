// The visitor's watchlist (SPEC.md 7.2): satellites marked with "☆ Watch" on the info card.
// Remembered in this browser only (localStorage, like the location); it never leaves the page.
// "Show only these" copies it into the filters' chosen list (state/filters.ts).

import { useSyncExternalStore } from 'react';

const KEY = 'satviewer.watchlist';

function load(): readonly number[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(v)) return [];
    return [...new Set(v.filter((n): n is number => Number.isInteger(n) && n > 0))];
  } catch {
    return [];
  }
}

let current: readonly number[] = load();
const listeners = new Set<() => void>();

function set(next: readonly number[]) {
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage blocked (private window): the list lasts until the page is closed.
  }
  for (const l of listeners) l();
}

export const watchlist = {
  get: (): readonly number[] => current,
  add(norad: number) {
    if (!current.includes(norad)) set([...current, norad]);
  },
  remove(norad: number) {
    set(current.filter((n) => n !== norad));
  },
  toggle(norad: number) {
    if (current.includes(norad)) watchlist.remove(norad);
    else watchlist.add(norad);
  },
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export const useWatchlist = (): readonly number[] =>
  useSyncExternalStore(watchlist.subscribe, watchlist.get);
