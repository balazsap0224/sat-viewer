// The visitor's location on the globe (for passes, module 6): a small dot fixed to the ground,
// so it turns with the Earth (as in Earth.tsx: inside a group rotated by GMST, the scene axes
// are ECEF, and ECEF (x, y, z) is scene (x, z, −y)).

import { useFrame } from '@react-three/fiber';
import { degToRad, gmst } from '@sat-viewer/core';
import { useRef } from 'react';
import type { Group } from 'three';
import { useObserver } from '../state/observer';
import { simClock } from '../state/simClock';

export function ObserverMarker() {
  const observer = useObserver();
  const ground = useRef<Group>(null);
  useFrame(() => {
    if (ground.current) ground.current.rotation.y = gmst(simClock.now());
  });
  if (!observer) return null;
  const lat = degToRad(observer.latDeg);
  const lon = degToRad(observer.lonDeg);
  const r = 1.002;
  return (
    <group ref={ground}>
      <mesh
        position={[
          r * Math.cos(lat) * Math.cos(lon),
          r * Math.sin(lat),
          -r * Math.cos(lat) * Math.sin(lon),
        ]}
      >
        <sphereGeometry args={[0.006, 12, 8]} />
        <meshBasicMaterial color="#ff5d5d" />
      </mesh>
    </group>
  );
}
