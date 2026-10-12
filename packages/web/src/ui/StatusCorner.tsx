// Bottom-left corner: object count, colour legend, data age, and performance (SPEC.md 7.3).

import { ORBIT_CLASSES, type OrbitClass } from '@sat-viewer/core';
import type { MetaFile } from '@sat-viewer/shared';
import { useEffect, useState } from 'react';
import { DEBRIS_COLOR, ORBIT_CLASS_COLORS } from '../scene/SatellitePoints';
import { useFilters } from '../state/filters';
import { perfStats } from '../state/perfStats';

export const CLASS_NAMES: Record<OrbitClass, string> = {
  LEO: 'Low Earth orbit',
  MEO: 'Medium Earth orbit',
  GEO: 'Geostationary',
  IGSO: 'Inclined geosynchronous',
  HEO: 'Highly elliptical',
};

const hoursAgo = (iso: string) => (Date.now() - Date.parse(iso)) / 3_600_000;

export function StatusCorner({ meta }: { readonly meta: MetaFile }) {
  const { debris } = useFilters();
  const [perf, setPerf] = useState(perfStats.get());
  useEffect(() => {
    const id = setInterval(() => setPerf(perfStats.get()), 1000);
    return () => clearInterval(id);
  }, []);
  const age = hoursAgo(meta.sources.gp.fetchedAt);

  return (
    <section className="pane status-corner" aria-label="Legend and data status">
      <div className="pane-section" style={{ borderTop: 0 }}>
        <div>
          <strong className="num">{meta.counts.objects.toLocaleString('en-US')}</strong>{' '}
          <span className="muted">active satellites</span>
        </div>
        <ul className="legend">
          {ORBIT_CLASSES.map((c) => (
            <li key={c}>
              <span className="legend-dot" style={{ background: ORBIT_CLASS_COLORS[c] }} />
              {c} <span className="faint">{CLASS_NAMES[c]}</span>
            </li>
          ))}
          {meta.counts.debris > 0 && (
            <li title="Fragments of three destroyed satellites (Filters → Show space debris)">
              <span className="legend-dot" style={{ background: DEBRIS_COLOR }} />
              Debris{' '}
              <span className="faint">
                {meta.counts.debris.toLocaleString('en-US')} pieces{debris ? '' : ', hidden'}
              </span>
            </li>
          )}
        </ul>
        <div className="faint small">
          Orbits from CelesTrak,{' '}
          {age < 48 ? `${age.toFixed(0)} h` : `${(age / 24).toFixed(0)} days`} ago
        </div>
        <div
          className="faint small num"
          title="Frames per second; SGP4 time per sample of all objects"
        >
          {perf.fps.toFixed(0)} fps · SGP4 {perf.sampleMs.toFixed(0)} ms / sample
        </div>
      </div>
    </section>
  );
}
