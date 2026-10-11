import { OrbitControls, Stars } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import { Earth } from './scene/Earth';
import { Sun } from './scene/Sun';
import { ClockReadout } from './ui/ClockReadout';

/**
 * SatViewer: one 3D canvas fills the window; panels float over it.
 */
export function App() {
  return (
    <>
      {/* Scene units are Earth radii; GEO is at 6.6 radii, so the far plane has room to spare. */}
      <Canvas camera={{ position: [0, 1.6, 6.5], fov: 45, near: 0.01, far: 1000 }}>
        <Suspense fallback={null}>
          <Earth />
        </Suspense>
        <Stars radius={300} depth={50} count={4000} factor={4} fade />
        <Sun />
        {/*
          minDistance 1.5 Earth radii (~3,200 km altitude): the closest view where the
          3.7 km/pixel texture still looks sharp. maxDistance 30 keeps GEO (6.6) well in view.
        */}
        <OrbitControls makeDefault enablePan={false} minDistance={1.5} maxDistance={30} />
      </Canvas>

      <header className="pane" style={headerStyle}>
        <strong style={{ fontSize: 15 }}>SatViewer</strong>
        <ClockReadout />
      </header>

      <div style={creditStyle}>Earth imagery: NASA Blue Marble / Black Marble</div>
    </>
  );
}

const headerStyle: React.CSSProperties = {
  position: 'absolute',
  top: 16,
  left: 16,
  display: 'flex',
  gap: 16,
  alignItems: 'baseline',
  padding: '8px 14px',
};

const creditStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 2,
  left: '50%',
  transform: 'translateX(-50%)',
  fontSize: 10,
  color: 'var(--faint)',
  pointerEvents: 'none',
  whiteSpace: 'nowrap',
};
