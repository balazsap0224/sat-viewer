// The other party of a close approach (selection "companion", ui/MeetingsPanel.tsx): a ring and
// label on it, and a line to the selected satellite with their distance at the shown time.
// Both are propagated with SGP4 on the main thread every frame (two objects: cheap and exact).

import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { norm, propagateAt, type SatRec, sub } from '@sat-viewer/core';
import { useEffect, useMemo, useRef } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  type Group,
  Line,
  LineBasicMaterial,
  type Mesh,
} from 'three';
import { simClock } from '../state/simClock';
import { temeToScene } from './coords';
import { hiddenByEarth } from './pick';

const COLOR = '#ff9f43';

/** Distance for the label: metres would claim more than the data knows (about 1 km). */
function fmtDistance(km: number): string {
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString('en-US')} km`;
}

export function MeetingMarker({
  satrec,
  other,
  otherName,
}: {
  /** The selected satellite */
  readonly satrec: SatRec;
  /** The companion */
  readonly other: SatRec;
  readonly otherName: string;
}) {
  const line = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(6), 3));
    const l = new Line(
      g,
      new LineBasicMaterial({ color: COLOR, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    l.frustumCulled = false;
    return l;
  }, []);
  useEffect(
    () => () => {
      line.geometry.dispose();
      line.material.dispose();
    },
    [line],
  );

  const ring = useRef<Mesh>(null);
  const label = useRef<Group>(null);
  const labelDiv = useRef<HTMLDivElement>(null);
  const mid = useRef<Group>(null);
  const distDiv = useRef<HTMLDivElement>(null);

  useFrame(({ camera }) => {
    const t = simClock.now();
    const a = propagateAt(satrec, t);
    const b = propagateAt(other, t);
    const ok = a.ok && b.ok;
    for (const o of [ring.current, label.current, mid.current, line]) if (o) o.visible = ok;
    if (!a.ok || !b.ok) return;

    const pa = temeToScene(a.r);
    const pb = temeToScene(b.r);
    const m = ring.current;
    if (m) {
      m.position.set(...pb);
      m.quaternion.copy(camera.quaternion);
      m.scale.setScalar(camera.position.distanceTo(m.position) * 0.014);
    }
    label.current?.position.set(...pb);
    const attr = line.geometry.getAttribute('position') as BufferAttribute;
    (attr.array as Float32Array).set([...pa, ...pb]);
    attr.needsUpdate = true;

    const pm = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2] as const;
    mid.current?.position.set(...pm);
    const c: [number, number, number] = [camera.position.x, camera.position.y, camera.position.z];
    if (labelDiv.current) labelDiv.current.style.display = hiddenByEarth(c, pb) ? 'none' : '';
    if (distDiv.current) {
      distDiv.current.style.display = hiddenByEarth(c, pm) ? 'none' : '';
      distDiv.current.textContent = fmtDistance(norm(sub(a.r, b.r)));
    }
  });

  return (
    <>
      <primitive object={line} />
      <mesh ref={ring}>
        <ringGeometry args={[0.8, 1, 32]} />
        <meshBasicMaterial color={COLOR} transparent opacity={0.95} depthWrite={false} />
      </mesh>
      <group ref={label}>
        {/* z-index 1: above the globe, below the panels (z-index 2), never over a card. */}
        <Html style={{ pointerEvents: 'none' }} zIndexRange={[1, 0]}>
          <div ref={labelDiv} className="sat-label">
            {otherName}
          </div>
        </Html>
      </group>
      <group ref={mid}>
        <Html style={{ pointerEvents: 'none' }} zIndexRange={[1, 0]}>
          <div ref={distDiv} className="sat-label meeting-distance" />
        </Html>
      </group>
    </>
  );
}
