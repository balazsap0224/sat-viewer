// Where the ISS is right now: the Phase 1 end check (SPEC.md 6.5, module 4) compares this
// with an independent tracker. Computed on the main thread with packages/core (one SGP4 call
// four times a second), independently of the worker and the GPU interpolation.

import {
  elementAgeDays,
  epochToUnixMs,
  propagateAt,
  type SatRec,
  satrecFromElements,
  temeToGeodetic,
} from '@sat-viewer/core';
import type { ElementRow } from '@sat-viewer/shared';
import { useEffect, useMemo, useState } from 'react';
import { simClock } from '../state/simClock';

export const ISS_NORAD = 25544;

export function satrecFromRow(r: ElementRow): SatRec {
  return satrecFromElements({
    NORAD_CAT_ID: r[0],
    EPOCH: r[1],
    MEAN_MOTION: r[2],
    ECCENTRICITY: r[3],
    INCLINATION: r[4],
    RA_OF_ASC_NODE: r[5],
    ARG_OF_PERICENTER: r[6],
    MEAN_ANOMALY: r[7],
    BSTAR: r[8],
    MEAN_MOTION_DOT: r[9],
    MEAN_MOTION_DDOT: r[10],
  });
}

const fmtLat = (d: number) => `${Math.abs(d).toFixed(2)}° ${d >= 0 ? 'N' : 'S'}`;
const fmtLon = (d: number) => `${Math.abs(d).toFixed(2)}° ${d >= 0 ? 'E' : 'W'}`;

export function IssPanel({ row }: { readonly row: ElementRow }) {
  const satrec = useMemo(() => satrecFromRow(row), [row]);
  const [t, setT] = useState(() => simClock.now());
  useEffect(() => {
    const id = setInterval(() => setT(simClock.now()), 250);
    return () => clearInterval(id);
  }, []);

  const s = propagateAt(satrec, t);
  const g = s.ok ? temeToGeodetic(s.r, t) : undefined;
  const age = elementAgeDays(epochToUnixMs(row[1]), Date.now());

  return (
    <section className="pane iss-panel" aria-label="ISS position">
      <div className="pane-head">
        <h2 className="pane-title">ISS (ZARYA) · {ISS_NORAD}</h2>
      </div>
      <div className="pane-section">
        {g ? (
          <dl className="kv num">
            <dt>Latitude</dt>
            <dd>{fmtLat(g.latDeg)}</dd>
            <dt>Longitude</dt>
            <dd>{fmtLon(g.lonDeg)}</dd>
            <dt>Altitude</dt>
            <dd>{g.altKm.toFixed(1)} km</dd>
          </dl>
        ) : (
          <p className="muted">No position (SGP4: {s.ok ? '' : s.failure})</p>
        )}
        <p className="faint small" style={{ margin: '8px 0 0' }}>
          Orbit data {age < 1 ? `${(age * 24).toFixed(1)} h` : `${age.toFixed(1)} days`} old ·
          WGS-84
        </p>
      </div>
    </section>
  );
}
