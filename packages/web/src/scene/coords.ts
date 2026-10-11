// Mapping between orbit frames and Three.js scene coordinates (copied from the game).
//
// TEME/ECI: z toward the North Pole, x toward the vernal equinox (right-handed).
// Three.js: y is up.
// We map  three = (x, z, −y), which keeps the system right-handed and puts the North Pole at
// the top of the screen. The scene is inertial: the camera and stars do not rotate, and the
// Earth mesh is rotated by GMST (see Earth.tsx).
//
// Scene units are Earth radii, so the globe has radius 1 and orbits stay at sane magnitudes
// for float32 GPU math.

import { R_EARTH, type Vec3 } from '@sat-viewer/core';

export type SceneVec = readonly [x: number, y: number, z: number];

/** TEME position [km] → scene coordinates [Earth radii]. */
export function temeToScene(r: Vec3): SceneVec {
  return [r.x / R_EARTH, r.z / R_EARTH, -r.y / R_EARTH];
}

/** TEME direction (unit vector) → scene direction (unit vector). */
export function temeDirToScene(d: Vec3): SceneVec {
  return [d.x, d.z, -d.y];
}
