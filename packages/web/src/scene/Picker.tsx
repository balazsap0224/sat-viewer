// Hover and click on satellites (SPEC.md 7.1): hover shows the name and owner, click selects.
// The math is in pick.ts; this connects it to the pointer.

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Matrix4 } from 'three';
import { hoverStore, selection } from '../state/selection';
import { pickNearest } from './pick';
import { satField } from './satField';

/** How close the pointer must be to a point [CSS px] */
const PICK_RADIUS_PX = 8;
/** A press that moves less than this is a click, not a drag of the globe [px] */
const CLICK_SLOP_PX = 5;

export function Picker({ norads }: { readonly norads: readonly number[] }) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const pointer = useRef<{ x: number; y: number } | undefined>(undefined);
  const dirty = useRef(false);
  const down = useRef<{ x: number; y: number } | undefined>(undefined);
  const matrix = useRef(new Matrix4());

  const pickAt = (x: number, y: number): number | undefined => {
    const el = gl.domElement;
    camera.updateMatrixWorld();
    matrix.current.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const c = camera.position;
    const i = pickNearest(
      norads.length,
      satField.positionOf,
      {
        viewProj: matrix.current.elements,
        camera: [c.x, c.y, c.z],
        width: el.clientWidth,
        height: el.clientHeight,
      },
      x,
      y,
      PICK_RADIUS_PX,
    );
    return i === undefined ? undefined : norads[i];
  };

  useEffect(() => {
    const el = gl.domElement;
    const local = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const move = (e: PointerEvent) => {
      pointer.current = local(e);
      dirty.current = true;
    };
    const leave = () => {
      pointer.current = undefined;
      hoverStore.set(null);
    };
    const press = (e: PointerEvent) => {
      down.current = local(e);
    };
    const release = (e: PointerEvent) => {
      const d = down.current;
      down.current = undefined;
      const p = local(e);
      if (!d || Math.hypot(p.x - d.x, p.y - d.y) > CLICK_SLOP_PX) return;
      const norad = pickAt(p.x, p.y);
      if (norad !== undefined) selection.select(norad);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    el.addEventListener('pointerdown', press);
    el.addEventListener('pointerup', release);
    return () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
      el.removeEventListener('pointerdown', press);
      el.removeEventListener('pointerup', release);
    };
    // pickAt reads refs only; norads changes with the data.
  }, [gl, camera, norads]);

  // At most one pick per frame, and only after the pointer moved (or while dragging, none).
  useFrame(() => {
    if (!dirty.current) return;
    dirty.current = false;
    const p = pointer.current;
    if (!p || down.current) return;
    const norad = pickAt(p.x, p.y);
    hoverStore.set(norad === undefined ? null : { norad, x: p.x, y: p.y });
    gl.domElement.style.cursor = norad === undefined ? '' : 'pointer';
  });

  return null;
}
