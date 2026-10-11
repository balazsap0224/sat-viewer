// Camera focus on the selected satellite ("Follow" on the info card). Adapted from the game's
// CameraRig.tsx, without its screens and rockets.
//
// Normally the orbit controls turn around the Earth's centre. While following, the controls'
// target is moved to the satellite every frame and the camera by the same amount, so the
// view keeps its angle and distance while the satellite travels; rotating and zooming then
// happen around it. Starting and stopping is a short *flight*: the point looked at slides
// from the old target to the new one while the distance eases to its new value.

import { useFrame, useThree } from '@react-three/fiber';
import { propagateAt, type SatRec } from '@sat-viewer/core';
import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import { selection } from '../state/selection';
import { simClock } from '../state/simClock';
import { temeToScene } from './coords';

/** The parts of drei's OrbitControls this component uses (registered with makeDefault). */
interface Controls {
  readonly target: Vector3;
  minDistance: number;
  enabled: boolean;
  update(): void;
}

/** Closest zoom around the Earth (App.tsx) and around a followed satellite [Earth radii] */
const EARTH_MIN_DISTANCE = 1.5;
const FOCUS_MIN_DISTANCE = 0.03; // ~190 km (the near plane is 0.01)
/** Distance from the satellite when following starts [Earth radii] */
const FOCUS_START_DISTANCE = 0.4;
/** Distance from the Earth's centre when following stops, if none was remembered */
const EARTH_RETURN_DISTANCE = 6.5;
/** Keep the camera above the ground when circling a low satellite */
const MIN_CAMERA_RADIUS = 1.01;
const FLIGHT_S = 1.4;

const ease = (u: number) => u * u * (3 - 2 * u);
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Flight {
  readonly from: Vector3;
  readonly to: () => Vector3;
  readonly fromOffset: Vector3;
  readonly toDist: number;
  elapsed: number;
  readonly onEnd: () => void;
}

export function CameraRig({ satrec }: { readonly satrec: SatRec | undefined }) {
  const controls = useThree((s) => s.controls) as unknown as Controls | null;
  const camera = useThree((s) => s.camera);
  const flight = useRef<Flight | undefined>(undefined);
  const following = useRef(false);
  /** Camera distance from the Earth's centre before following started, to return to */
  const earthDistance = useRef<number | undefined>(undefined);

  const satPosition = (): Vector3 | undefined => {
    if (!satrec) return undefined;
    const s = propagateAt(satrec, simClock.now());
    return s.ok ? new Vector3(...temeToScene(s.r)) : undefined;
  };

  useEffect(() => {
    if (!controls) return;
    const offset = camera.position.clone().sub(controls.target);
    const from = controls.target.clone();
    if (satrec) {
      // Remember the Earth view only when coming from it (not when switching satellites).
      if (!following.current && !flight.current) earthDistance.current = camera.position.length();
      following.current = false;
      controls.minDistance = FOCUS_MIN_DISTANCE;
      flight.current = {
        from,
        to: () => satPosition() ?? from,
        fromOffset: offset,
        toDist: Math.min(offset.length(), FOCUS_START_DISTANCE),
        elapsed: reducedMotion() ? FLIGHT_S : 0,
        onEnd: () => (following.current = true),
      };
    } else if (following.current || flight.current) {
      following.current = false;
      flight.current = {
        from,
        to: () => new Vector3(0, 0, 0),
        fromOffset: offset,
        toDist: earthDistance.current ?? EARTH_RETURN_DISTANCE,
        elapsed: reducedMotion() ? FLIGHT_S : 0,
        onEnd: () => (controls.minDistance = EARTH_MIN_DISTANCE),
      };
    }
    // satPosition reads the satrec passed in; re-run only when the followed satellite changes.
  }, [controls, camera, satrec]);

  useFrame((_, dt) => {
    if (!controls) return;
    const f = flight.current;
    if (f) {
      f.elapsed += dt;
      const u = Math.min(1, f.elapsed / FLIGHT_S);
      const e = ease(u);
      const point = f.from.clone().lerp(f.to(), e);
      const dist = f.fromOffset.length() + (f.toDist - f.fromOffset.length()) * e;
      controls.target.copy(point);
      camera.position.copy(point).addScaledVector(f.fromOffset.clone().normalize(), dist);
      if (camera.position.length() < MIN_CAMERA_RADIUS)
        camera.position.setLength(MIN_CAMERA_RADIUS);
      controls.enabled = u >= 1;
      controls.update();
      if (u >= 1) {
        flight.current = undefined;
        f.onEnd();
      }
      return;
    }
    if (!following.current) return;
    const p = satPosition();
    if (!p) {
      // SGP4 cannot place it at this time (decayed): stop following.
      selection.setFocused(false);
      return;
    }
    const delta = p.sub(controls.target);
    controls.target.add(delta);
    camera.position.add(delta);
    if (camera.position.length() < MIN_CAMERA_RADIUS) camera.position.setLength(MIN_CAMERA_RADIUS);
    controls.update();
  });

  return null;
}
