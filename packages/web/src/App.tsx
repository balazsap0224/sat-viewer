import { OrbitControls, Stars } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { Suspense, useMemo } from 'react';
import { type SatData, useSatData } from './data/load';
import { Earth } from './scene/Earth';
import { IssMarker } from './scene/IssMarker';
import { SatellitePoints } from './scene/SatellitePoints';
import { Sun } from './scene/Sun';
import { perfStats } from './state/perfStats';
import { ISS_NORAD, IssPanel, satrecFromRow } from './ui/IssPanel';
import { StatusCorner } from './ui/StatusCorner';
import { TimeBar } from './ui/TimeBar';

/** Counts rendered frames for the fps readout. */
function FrameCounter() {
  useFrame(() => perfStats.frame());
  return null;
}

/**
 * SatViewer: one 3D canvas fills the window; panels float over it.
 */
export function App() {
  const state = useSatData();
  const data = state.status === 'ready' ? state.data : undefined;
  const issRow = useMemo(() => data?.elements.rows.find((r) => r[0] === ISS_NORAD), [data]);
  const issSatrec = useMemo(() => issRow && satrecFromRow(issRow), [issRow]);

  return (
    <>
      {/* Scene units are Earth radii; GEO is at 6.6 radii, so the far plane has room to spare. */}
      <Canvas camera={{ position: [0, 1.6, 6.5], fov: 45, near: 0.01, far: 1000 }}>
        <Suspense fallback={null}>
          <Earth />
        </Suspense>
        {data && <SatellitePoints rows={data.elements.rows} />}
        {issSatrec && <IssMarker satrec={issSatrec} />}
        <Stars radius={300} depth={50} count={4000} factor={4} fade />
        <Sun />
        {/*
          minDistance 1.5 Earth radii (~3,200 km altitude): the closest view where the
          3.7 km/pixel texture still looks sharp. maxDistance 30 keeps GEO (6.6) well in view.
        */}
        <OrbitControls makeDefault enablePan={false} minDistance={1.5} maxDistance={30} />
        <FrameCounter />
      </Canvas>

      <header className="pane app-header">
        <strong style={{ fontSize: 15 }}>SatViewer</strong>
        <span className="muted small">Every active satellite, in real time</span>
      </header>

      {state.status === 'loading' && <div className="pane notice">Loading satellite data…</div>}
      {state.status === 'error' && (
        <div className="pane notice" role="alert">
          Could not load the satellite data: {state.message}
          <div className="faint small">Run the data job first: pnpm data</div>
        </div>
      )}

      {data && <Panels data={data} issRow={issRow} />}

      <TimeBar />

      <footer className="credits">
        Orbits: CelesTrak · Satellite details: GCAT (J. McDowell, planet4589.org/space/gcat) ·
        Earth: NASA Blue Marble / Black Marble · SGP4: satellite.js
      </footer>
    </>
  );
}

function Panels({
  data,
  issRow,
}: {
  readonly data: SatData;
  readonly issRow: SatData['elements']['rows'][number] | undefined;
}) {
  return (
    <>
      {issRow && <IssPanel row={issRow} />}
      <StatusCorner meta={data.meta} count={data.elements.rows.length} />
    </>
  );
}
