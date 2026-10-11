// The time the globe shows, in UTC, ticking.

import { useEffect, useState } from 'react';
import { simClock } from '../state/simClock';

/** "2026-10-11 13:45:07 UTC" */
export const formatUtc = (t: number) =>
  `${new Date(t).toISOString().slice(0, 19).replace('T', ' ')} UTC`;

export function ClockReadout() {
  const [t, setT] = useState(() => simClock.now());
  useEffect(() => {
    const id = setInterval(() => setT(simClock.now()), 250);
    return () => clearInterval(id);
  }, []);
  return <span className="num">{formatUtc(t)}</span>;
}
