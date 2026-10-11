// Which satellite is selected (info card, orbit line) and hovered (tooltip), and whether the
// camera follows the selected one. Objects are identified by NORAD number.

import { useSyncExternalStore } from 'react';

export interface SelectionState {
  readonly selected: number | null;
  /** The camera follows the selected satellite */
  readonly focused: boolean;
}

let state: SelectionState = { selected: null, focused: false };
const listeners = new Set<() => void>();

function set(next: SelectionState) {
  state = next;
  for (const l of listeners) l();
}

export const selection = {
  get: (): SelectionState => state,
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  /** Selects a satellite (null clears). Following stops when nothing is selected. */
  select(norad: number | null) {
    if (norad === state.selected) return;
    set({ selected: norad, focused: norad !== null && state.focused });
  },
  setFocused(focused: boolean) {
    set({ ...state, focused: focused && state.selected !== null });
  },
};

export const useSelection = (): SelectionState =>
  useSyncExternalStore(selection.subscribe, selection.get);

// Hover is separate: it changes often and only the tooltip listens to it.
export interface Hover {
  readonly norad: number;
  /** Pointer position in the canvas [CSS px] */
  readonly x: number;
  readonly y: number;
}
let hover: Hover | null = null;
const hoverListeners = new Set<() => void>();

export const hoverStore = {
  get: (): Hover | null => hover,
  set(next: Hover | null) {
    if (next?.norad === hover?.norad && next?.x === hover?.x && next?.y === hover?.y) return;
    hover = next;
    for (const l of hoverListeners) l();
  },
  subscribe: (l: () => void) => {
    hoverListeners.add(l);
    return () => hoverListeners.delete(l);
  },
};

export const useHover = (): Hover | null =>
  useSyncExternalStore(hoverStore.subscribe, hoverStore.get);
