import { OrbitControls, Stars } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { Suspense, useMemo, useState } from 'react';
import { type SatData, useSatData } from './data/load';
import { satrecFromRow } from './data/elements';
import { CameraRig } from './scene/CameraRig';
import { Earth } from './scene/Earth';
import { MeetingMarker } from './scene/MeetingMarker';
import { ObserverMarker } from './scene/ObserverMarker';
import { Picker } from './scene/Picker';
import { ORBIT_CLASS_COLORS, SatellitePoints } from './scene/SatellitePoints';
import { SelectedSat } from './scene/SelectedSat';
import { Sun } from './scene/Sun';
import { ViewShift } from './scene/ViewShift';
import { filterMask, useFilters } from './state/filters';
import { perfStats } from './state/perfStats';
import { useSelection } from './state/selection';
import { useUrlSync } from './state/useUrlSync';
import { AboutDialog } from './ui/AboutDialog';
import { FiltersPanel } from './ui/FiltersPanel';
import { HoverTip } from './ui/HoverTip';
import { InfoCard } from './ui/InfoCard';
import { MeetingsPanel } from './ui/MeetingsPanel';
import { PassesPanel } from './ui/PassesPanel';
import { type LayoutProps, PhoneLayout } from './ui/PhoneLayout';
import { SearchBox } from './ui/SearchBox';
import { StatusCorner } from './ui/StatusCorner';
import { TimeBar } from './ui/TimeBar';
import { usePhone } from './ui/usePhone';
import { WatchlistPanel } from './ui/WatchlistPanel';

/** Counts rendered frames for the fps readout. */
function FrameCounter() {
  useFrame(() => perfStats.frame());
  return null;
}

/** The selected object's row index, SGP4 record and catalog entry, or undefined. */
function useSelected(data: SatData | undefined) {
  const { selected, focused, companion } = useSelection();
  const other = useMemo(() => {
    if (!data || companion === null) return undefined;
    const i = data.indexOf.get(companion);
    if (i === undefined) return undefined;
    try {
      const satrec = satrecFromRow(data.elements.rows[i]!);
      return { satrec, name: data.catalog[i]?.name ?? String(companion) };
    } catch {
      return undefined;
    }
  }, [data, companion]);
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
  return { sel, focused, other };
}

/**
 * SatViewer: one 3D canvas fills the window; panels float over it. Phones get their own
 * arrangement of the same panels (ui/PhoneLayout.tsx, module 8).
 */
export function App() {
  const state = useSatData();
  const data = state.status === 'ready' ? state.data : undefined;
  useUrlSync(data);
  const filters = useFilters();
  const mask = useMemo(
    () => data && filterMask(filters, data.catalog, data.classes, data.elements.rows),
    [data, filters],
  );
  const shown = useMemo(() => (mask ? mask.reduce((n, v) => n + v, 0) : 0), [mask]);
  const norads = useMemo(() => data?.elements.rows.map((r) => r[0]) ?? [], [data]);
  const { sel, focused, other } = useSelected(data);
  const [about, setAbout] = useState(false);
  const phone = usePhone();

  return (
    <>
      {/* Scene units are Earth radii; GEO is at 6.6 radii, so the far plane has room to spare. */}
      <Canvas camera={{ position: [0, 1.6, 6.5], fov: 45, near: 0.01, far: 1000 }}>
        <Suspense fallback={null}>
          <Earth />
        </Suspense>
        {data && mask && (
          <SatellitePoints
            rows={data.elements.rows}
            classes={data.classes}
            mask={mask}
            debris={data.debris}
          />
        )}
        {sel && (
          <SelectedSat
            satrec={sel.satrec}
            meanMotion={sel.row[2]}
            name={sel.entry?.name ?? String(sel.row[0])}
            color={ORBIT_CLASS_COLORS[sel.cls]}
          />
        )}
        {sel && other && (
          <MeetingMarker satrec={sel.satrec} other={other.satrec} otherName={other.name} />
        )}
        <ObserverMarker />
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
        <ViewShift />
        <FrameCounter />
      </Canvas>

      {state.status === 'loading' && <div className="pane notice">Loading satellite data…</div>}
      {state.status === 'error' && (
        <div className="pane notice" role="alert">
          Could not load the satellite data: {state.message}
          <div className="faint small">Run the data job first: pnpm data</div>
        </div>
      )}
      {data && about && <AboutDialog meta={data.meta} onClose={() => setAbout(false)} />}

      {phone ? (
        <PhoneLayout
          data={data}
          sel={sel}
          mask={mask}
          shown={shown}
          onAbout={() => setAbout(true)}
        />
      ) : (
        <DesktopLayout
          data={data}
          sel={sel}
          mask={mask}
          shown={shown}
          onAbout={() => setAbout(true)}
        />
      )}
    </>
  );
}

/** The desktop arrangement: two columns of panels, the time bar bottom centre. */
function DesktopLayout({ data, sel, mask, shown, onAbout }: LayoutProps) {
  return (
    <>
      <div className="left-column">
        <header className="pane app-header">
          <strong style={{ fontSize: 15 }}>SatViewer</strong>
          <span className="muted small app-tagline">Every active satellite, live</span>
          <button className="btn-ghost small about-link" onClick={onAbout}>
            About
          </button>
        </header>
        {data && <SearchBox data={data} />}
        {data && <WatchlistPanel data={data} />}
        {data && (
          <PassesPanel
            key={sel?.row[0] ?? 'none'}
            data={data}
            satrec={sel?.satrec}
            name={sel?.entry?.name}
          />
        )}
        {data && mask && <MeetingsPanel data={data} mask={mask} />}
        {data && <StatusCorner meta={data.meta} />}
      </div>

      <div className="right-column">
        {data && sel && (
          <InfoCard
            key={sel.row[0]}
            row={sel.row}
            entry={sel.entry}
            cls={sel.cls}
            satrec={sel.satrec}
          />
        )}
        {data && <FiltersPanel data={data} shown={shown} />}
      </div>
      {data && <HoverTip data={data} />}

      <TimeBar />

      <footer className="credits">
        Orbits: CelesTrak · Satellite details: GCAT (J. McDowell, planet4589.org/space/gcat) ·
        Earth: NASA Blue Marble / Black Marble · SGP4: satellite.js
      </footer>
    </>
  );
}
