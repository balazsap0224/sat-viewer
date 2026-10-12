// Phone or desktop layout (module 8). A phone is a window narrower than 700 px or lower than
// 500 px; lower than 500 px and wider than tall is a phone held sideways. layout.css uses the
// same numbers in its phone section; change both together.

import { useCallback, useSyncExternalStore } from 'react';

export const PHONE_QUERY = '(max-width: 700px), (max-height: 500px)';
export const SIDEWAYS_QUERY = '(max-height: 500px) and (orientation: landscape)';

function useMedia(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const m = window.matchMedia(query);
      m.addEventListener('change', onChange);
      return () => m.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}

/** True while the window has phone size; follows rotation and resizing. */
export const usePhone = (): boolean => useMedia(PHONE_QUERY);

/** True while a phone is held sideways (the panels then sit in a column on the left). */
export const useSideways = (): boolean => useMedia(SIDEWAYS_QUERY);
