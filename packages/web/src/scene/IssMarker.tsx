// A ring around the ISS, so it can be found on the globe and compared with a tracker.
// Positioned every frame from SGP4 on the main thread (one object), independently of the
// worker's samples, so a mismatch between the two would be visible.

import { useFrame } from '@react-three/fiber';
import { propagateAt, type SatRec } from '@sat-viewer/core';
import { useRef } from 'react';
import type { Mesh } from 'three';
import { simClock } from '../state/simClock';
import { temeToScene } from './coords';

export function IssMarker({ satrec }: { readonly satrec: SatRec }) {
  const ring = useRef<Mesh>(null);
  useFrame(({ camera }) => {
    const m = ring.current;
    if (!m) return;
    const s = propagateAt(satrec, simClock.now());
    m.visible = s.ok;
    if (!s.ok) return;
    m.position.set(...temeToScene(s.r));
    // Face the camera and keep a constant size on screen.
    m.quaternion.copy(camera.quaternion);
    const d = camera.position.distanceTo(m.position);
    m.scale.setScalar(d * 0.012);
  });
  return (
    <mesh ref={ring}>
      <ringGeometry args={[0.8, 1, 32]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.9} depthWrite={false} />
    </mesh>
  );
}
