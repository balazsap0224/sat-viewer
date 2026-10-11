import { Matrix4, PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { hiddenByEarth, pickNearest, type PositionOf } from './pick';

describe('hiddenByEarth', () => {
  const cam = [0, 0, 5] as const;
  it('a point on the far side is hidden, one on the near side or beside the Earth is not', () => {
    expect(hiddenByEarth(cam, [0, 0, -1.1])).toBe(true);
    expect(hiddenByEarth(cam, [0, 0, 1.1])).toBe(false);
    expect(hiddenByEarth(cam, [1.5, 0, -1.1])).toBe(false);
  });
});

describe('pickNearest', () => {
  // Camera 5 Earth radii out on +z looking at the origin, 800 × 600 canvas.
  const camera = new PerspectiveCamera(45, 800 / 600, 0.01, 1000);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const viewProj = new Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  );
  const view = { viewProj: viewProj.elements, camera: [0, 0, 5] as const, width: 800, height: 600 };
  const points: [number, number, number][] = [
    [0, 0, 1.1], // in front of the Earth's centre: screen centre
    [0, 0, -1.1], // behind the Earth: same screen spot, hidden
    [1.5, 0, 0], // to the right
  ];
  const positionOf: PositionOf = (i, out) => {
    out.splice(0, 3, ...points[i]!);
    return true;
  };

  it('picks the visible point at the screen centre, not the one behind the Earth', () => {
    expect(pickNearest(3, positionOf, view, 400, 300, 8)).toBe(0);
  });

  it('nothing within the radius: undefined', () => {
    expect(pickNearest(3, positionOf, view, 100, 100, 8)).toBeUndefined();
  });

  it('skips objects that are hidden or filtered out', () => {
    const only2: PositionOf = (i, out) => i === 2 && positionOf(i, out);
    expect(pickNearest(3, only2, view, 400, 300, 8)).toBeUndefined();
    // Point 2 projects right of centre: x = 1.5 at distance 5, tan(22.5°) = 0.4142 →
    // ndc 1.5 / 5 / (0.4142 · 4/3) = 0.5432 → 400 + 0.5432 · 400 = 617 px.
    expect(pickNearest(3, only2, view, 617, 300, 8)).toBe(2);
  });
});
