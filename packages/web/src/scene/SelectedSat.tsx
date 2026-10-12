// The selected satellite on the globe (SPEC.md 7.1): a ring marker, its orbit line, its
// ground track (one orbit back, dim; one ahead, bright), its coverage footprint and a label.
//
// Everything here is computed with SGP4 on the main thread for this one object, so it is
// exact rather than interpolated (packages/core: track.ts, footprint.ts).
//
// Frames: the orbit line is drawn in the inertial scene (TEME), where an orbit is a fixed
// loop. The ground track and the footprint belong to the ground, so they are drawn inside a
// group turned by GMST, like the Earth (Earth.tsx); in that group the scene axes are ECEF.

import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import {
  degToRad,
  footprintHalfAngle,
  gmst,
  groundTrack,
  orbitPath,
  propagateAt,
  radToDeg,
  type SatRec,
  smallCircle,
  temeToGeodetic,
} from '@sat-viewer/core';
import { useEffect, useMemo, useRef } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  type Group,
  Line,
  LineBasicMaterial,
  LineLoop,
  type Mesh,
} from 'three';
import { simClock } from '../state/simClock';
import { temeToScene } from './coords';
import { hiddenByEarth } from './pick';

/** Segments of the orbit line, and of each orbit of the ground track */
const ORBIT_SEGMENTS = 256;
const FOOTPRINT_POINTS = 128;
/** Heights above the globe (radius 1) so the lines are not hidden in the texture */
const TRACK_RADIUS = 1.003;
const FOOTPRINT_RADIUS = 1.004;
/** Recompute the orbit line and track after this much real time [ms]… */
const REFRESH_MS = 1000;
/** …or after the shown time moved this fraction of the span (fast speeds, jumps) */
const REFRESH_FRACTION = 0.02;

/**
 * Latitude/longitude [deg] → point on the globe in ECEF scene axes. The texture is drawn in
 * geodetic latitude, so geodetic latitude goes straight into the sphere's direction.
 * ECEF (x, y, z) maps to scene (x, z, −y) (coords.ts).
 */
function groundPoint(latDeg: number, lonDeg: number, r: number, out: Float32Array, k: number) {
  const lat = degToRad(latDeg);
  const lon = degToRad(lonDeg);
  out[3 * k] = r * Math.cos(lat) * Math.cos(lon);
  out[3 * k + 1] = r * Math.sin(lat);
  out[3 * k + 2] = -r * Math.cos(lat) * Math.sin(lon);
}

function makeLine(loop: boolean, color: string, opacity: number, maxPoints: number) {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(3 * maxPoints), 3));
  g.setDrawRange(0, 0);
  const m = new LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const line = loop ? new LineLoop(g, m) : new Line(g, m);
  line.frustumCulled = false;
  return line;
}

function setPoints(line: Line, fill: (out: Float32Array) => number) {
  const attr = line.geometry.getAttribute('position') as BufferAttribute;
  const count = fill(attr.array as Float32Array);
  attr.needsUpdate = true;
  line.geometry.setDrawRange(0, count);
}

export interface SelectedSatProps {
  readonly satrec: SatRec;
  /** Mean motion [rev/day], for the period */
  readonly meanMotion: number;
  readonly name: string;
  readonly color: string;
}

export function SelectedSat({ satrec, meanMotion, name, color }: SelectedSatProps) {
  const lines = useMemo(
    () => ({
      orbit: makeLine(false, color, 0.75, ORBIT_SEGMENTS + 1),
      past: makeLine(false, color, 0.3, ORBIT_SEGMENTS + 1),
      future: makeLine(false, color, 0.85, ORBIT_SEGMENTS + 1),
      footprint: makeLine(true, '#ffffff', 0.55, FOOTPRINT_POINTS),
    }),
    [color],
  );
  useEffect(
    () => () => {
      for (const l of Object.values(lines)) {
        l.geometry.dispose();
        l.material.dispose();
      }
    },
    [lines],
  );

  const ground = useRef<Group>(null);
  const ring = useRef<Mesh>(null);
  const label = useRef<Group>(null);
  const labelDiv = useRef<HTMLDivElement>(null);
  const last = useRef<{ real: number; t: number } | undefined>(undefined);

  // A new satellite: recompute at once.
  useEffect(() => {
    last.current = undefined;
  }, [satrec]);

  useFrame(({ camera }) => {
    const t = simClock.now();
    const s = propagateAt(satrec, t);
    const visible = s.ok;
    for (const obj of [ring.current, label.current, lines.footprint])
      if (obj) obj.visible = visible;
    if (ground.current) ground.current.rotation.y = gmst(t);
    if (!s.ok) return;

    // Marker ring: faces the camera, constant size on screen.
    const p = temeToScene(s.r);
    const m = ring.current;
    if (m) {
      m.position.set(...p);
      m.quaternion.copy(camera.quaternion);
      m.scale.setScalar(camera.position.distanceTo(m.position) * 0.014);
    }
    label.current?.position.set(...p);
    // The HTML label is not part of the 3D depth test: hide it behind the Earth by hand.
    if (labelDiv.current) {
      const c = camera.position;
      labelDiv.current.style.display = hiddenByEarth([c.x, c.y, c.z], p) ? 'none' : '';
    }

    // Footprint around the sub-satellite point, at the horizon (0° elevation, [PROPOSED]).
    const g = temeToGeodetic(s.r, t);
    const lambda = footprintHalfAngle(g.altKm, 0);
    const circle = smallCircle(degToRad(g.latDeg), degToRad(g.lonDeg), lambda, FOOTPRINT_POINTS);
    setPoints(lines.footprint, (out) => {
      circle.forEach((c, k) =>
        groundPoint(radToDeg(c.latRad), radToDeg(c.lonRad), FOOTPRINT_RADIUS, out, k),
      );
      return circle.length;
    });

    // Orbit line and ground track: refresh now and then (each is ~500 SGP4 calls).
    const real = performance.now();
    const spanMs = (1440 / meanMotion) * 60_000;
    const l = last.current;
    if (l && real - l.real < REFRESH_MS && Math.abs(t - l.t) < REFRESH_FRACTION * spanMs) return;
    last.current = { real, t };

    const path = orbitPath(satrec, meanMotion, t, ORBIT_SEGMENTS);
    setPoints(lines.orbit, (out) => {
      path.forEach((r, k) => out.set(temeToScene(r), 3 * k));
      return path.length;
    });
    const track = groundTrack(satrec, meanMotion, t, ORBIT_SEGMENTS);
    const past = track.filter((q) => q.t <= t);
    const future = track.filter((q) => q.t >= t);
    setPoints(lines.past, (out) => {
      past.forEach((q, k) => groundPoint(q.latDeg, q.lonDeg, TRACK_RADIUS, out, k));
      return past.length;
    });
    setPoints(lines.future, (out) => {
      future.forEach((q, k) => groundPoint(q.latDeg, q.lonDeg, TRACK_RADIUS, out, k));
      return future.length;
    });
  });

  return (
    <>
      <primitive object={lines.orbit} />
      <group ref={ground}>
        <primitive object={lines.past} />
        <primitive object={lines.future} />
        <primitive object={lines.footprint} />
      </group>
      <mesh ref={ring}>
        <ringGeometry args={[0.8, 1, 32]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.95} depthWrite={false} />
      </mesh>
      <group ref={label}>
        {/* z-index 1: above the globe, below the panels (z-index 2), never over a card. */}
        <Html style={{ pointerEvents: 'none' }} zIndexRange={[1, 0]}>
          <div ref={labelDiv} className="sat-label">
            {name}
          </div>
        </Html>
      </group>
    </>
  );
}
