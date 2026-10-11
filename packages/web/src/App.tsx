import { OrbitControls, Stars } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { Suspense, useMemo, useState } from 'react';
import { type SatData, useSatData } from './data/load';
import { satrecFromRow } from './data/elements';
import { CameraRig } from './scene/CameraRig';
import { Earth } from './scene/Earth';
import { Picker } from './scene/Picker';
import { ORBIT_CLASS_COLORS, SatellitePoints } from './scene/SatellitePoints';
import { SelectedSat } from './scene/SelectedSat';
import { Sun } from './scene/Sun';
import { filterMask, useFilters } from './state/filters';
import { perfStats } from './state/perfStats';
import { useSelection } from './state/selection';
import { useUrlSync } from './state/useUrlSync';
import { AboutDialog } from './ui/AboutDialog';
import { FiltersPanel } from './ui/FiltersPanel';
import { HoverTip } from './ui/HoverTip';
import { InfoCard } from './ui/InfoCard';
import { SearchBox } from './ui/SearchBox';
import { StatusCorner } from './ui/StatusCorner';
import { TimeBar } from './ui/TimeBar';

/** Counts rendered frames for the fps readout. */
function FrameCounter() {
  useFrame(() => perfStats.frame());
  return null;
}

/** The selected object's row index, SGP4 record and catalog entry, or undefined. */
function useSelected(data: SatData | undefined) {
  const { selected, focused } = useSelection();
  const sel = useMemo(() => {
    if (!data || selected === null) return undefined;
    const i = data.indexOf.get(selected);
    if (i === undefined) return undefined;
    const row = data.elements.rows[i]!;
    try {
      return { i, row, satrec: satrecFromRow(row), entry: data.catalog[i], cls: data.classes[i]! };
    } catch {
      return undefined; // SGP4 cannot initialise these elements (hidden on the globe too)
    }
  }, [data, selected]);
  return { sel, focused };
}

/**
 * SatViewer: one 3D canvas fills the window; panels float over it.
 */
export function App() {
  const state = useSatData();
  const data = state.status === 'ready' ? state.data : undefined;
  useUrlSync(data);
  const filters = useFilters();
  const mask = useMemo(
    () => data && filterMask(filters, data.catalog, data.classes),
    [data, filters],
  );
  const shown = useMemo(() => (mask ? mask.reduce((n, v) => n + v, 0) : 0), [mask]);
  const norads = useMemo(() => data?.elements.rows.map((r) => r[0]) ?? [], [data]);
  const { sel, focused } = useSelected(data);
  const [about, setAbout] = useState(false);

  return (
    <>
      {/* Scene units are Earth radii; GEO is at 6.6 radii, so the far plane has room to spare. */}
      <Canvas camera={{ position: [0, 1.6, 6.5], fov: 45, near: 0.01, far: 1000 }}>
        <Suspense fallback={null}>
          <Earth />
        </Suspense>
        {data && mask && (
          <SatellitePoints rows={data.elements.rows} classes={data.classes} mask={mask} />
        )}
        {sel && (
          <SelectedSat
            satrec={sel.satrec}
            meanMotion={sel.row[2]}
            name={sel.entry?.name ?? String(sel.row[0])}
            color={ORBIT_CLASS_COLORS[sel.cls]}
          />
        )}
        <Stars radius={300} depth={50} count={4000} factor={4} fade />
        <Sun />
        {/*
          minDistance 1.5 Earth radii (~3,200 km altitude): the closest view where the
          3.7 km/pixel texture still looks sharp. maxDistance 30 keeps GEO (6.6) well in view.
          CameraRig lowers minDistance while following a satellite.
        */}
        <OrbitControls makeDefault enablePan={false} minDistance={1.5} maxDistance={30} />
        <CameraRig satrec={focused ? sel?.satrec : undefined} />
        {data && <Picker norads={norads} />}
        <FrameCounter />
      </Canvas>

      <div className="left-column">
        <header className="pane app-header">
          <strong style={{ fontSize: 15 }}>SatViewer</strong>
          <span className="muted small app-tagline">Every active satellite, live</span>
          <button className="btn-ghost small about-link" onClick={() => setAbout(true)}>
            About
          </button>
        </header>
        {data && <SearchBox data={data} />}
        {data && <FiltersPanel data={data} shown={shown} />}
      </div>

      {state.status === 'loading' && <div className="pane notice">Loading satellite data…</div>}
      {state.status === 'error' && (
        <div className="pane notice" role="alert">
          Could not load the satellite data: {state.message}
          <div className="faint small">Run the data job first: pnpm data</div>
        </div>
      )}

      {data && sel && (
        <InfoCard
          key={sel.row[0]}
          row={sel.row}
          entry={sel.entry}
          cls={sel.cls}
          satrec={sel.satrec}
        />
      )}
      {data && <StatusCorner meta={data.meta} count={data.elements.rows.length} />}
      {data && <HoverTip data={data} />}
      {data && about && <AboutDialog meta={data.meta} onClose={() => setAbout(false)} />}

      <TimeBar />

      <footer className="credits">
        Orbits: CelesTrak · Satellite details: GCAT (J. McDowell, planet4589.org/space/gcat) ·
        Earth: NASA Blue Marble / Black Marble · SGP4: satellite.js
      </footer>
    </>
  );
}
