// Slides the picture so the globe sits in the area the panels leave free (viewInsets.ts).
// The slide eases over a few frames, so opening a sheet does not make the globe jump.

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { PerspectiveCamera } from 'three';
import { viewInsets, viewOffsetFor } from './viewInsets';

/** Fraction of the remaining distance covered per frame */
const EASE = 0.2;

export function ViewShift() {
  const current = useRef({ x: 0, y: 0 });

  useFrame(({ camera, size }) => {
    const cam = camera as PerspectiveCamera;
    const target = viewOffsetFor(viewInsets);
    const c = current.current;
    const near = Math.abs(target.x - c.x) < 0.5 && Math.abs(target.y - c.y) < 0.5;
    c.x = near ? target.x : c.x + (target.x - c.x) * EASE;
    c.y = near ? target.y : c.y + (target.y - c.y) * EASE;

    const unchanged =
      cam.view?.enabled &&
      cam.view.offsetX === c.x &&
      cam.view.offsetY === c.y &&
      cam.view.fullWidth === size.width &&
      cam.view.fullHeight === size.height;
    if (unchanged) return;
    if (c.x === 0 && c.y === 0) {
      if (cam.view?.enabled) cam.clearViewOffset();
      return;
    }
    cam.setViewOffset(size.width, size.height, c.x, c.y, size.width, size.height);
  });

  return null;
}
