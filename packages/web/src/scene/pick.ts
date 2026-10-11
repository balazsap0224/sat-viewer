// Finding the satellite under the mouse pointer (hover and click, SPEC.md 7.1).
//
// The points are placed by the vertex shader, so three's raycaster cannot see them. Instead
// this computes each visible object's interpolated position on the CPU (the same Hermite
// formula as the shader), projects it to the screen, and takes the nearest one within a few
// pixels that the Earth does not hide. 17,000 objects take about 1 ms; it runs at most once
// per animation frame, only while the pointer moves.
//
// Pure math on plain arrays, so it is tested without a browser.

/** Scene position of object i written into `out`; false when it is hidden or filtered out. */
export type PositionOf = (i: number, out: [number, number, number]) => boolean;

/**
 * Is the point P hidden behind the Earth (a unit sphere at the origin) when seen from C?
 * The segment C + s(P − C), s ∈ (0, 1), meets the sphere where |C + s·f|² = 1 with f = P − C:
 *   a s² + b s + c = 0,   a = f·f,  b = 2 C·f,  c = C·C − 1.
 * The nearer root s₁ = (−b − √(b² − 4ac)) / 2a inside (0, 1) means the Earth is in the way.
 */
export function hiddenByEarth(
  c: readonly [number, number, number],
  p: readonly [number, number, number],
): boolean {
  const fx = p[0] - c[0];
  const fy = p[1] - c[1];
  const fz = p[2] - c[2];
  const a = fx * fx + fy * fy + fz * fz;
  const b = 2 * (c[0] * fx + c[1] * fy + c[2] * fz);
  const cc = c[0] * c[0] + c[1] * c[1] + c[2] * c[2] - 1;
  const disc = b * b - 4 * a * cc;
  if (disc < 0 || a === 0) return false;
  const s1 = (-b - Math.sqrt(disc)) / (2 * a);
  return s1 > 0 && s1 < 1;
}

export interface PickView {
  /** Projection × view matrix, column-major (three's Matrix4.elements) */
  readonly viewProj: ArrayLike<number>;
  readonly camera: readonly [number, number, number];
  /** Canvas size [CSS px] */
  readonly width: number;
  readonly height: number;
}

/**
 * Index of the visible object nearest to the pointer (px, py) [CSS px from the top left],
 * within `maxPx`; undefined when there is none.
 */
export function pickNearest(
  n: number,
  positionOf: PositionOf,
  view: PickView,
  px: number,
  py: number,
  maxPx: number,
): number | undefined {
  const m = view.viewProj;
  const p: [number, number, number] = [0, 0, 0];
  let best: number | undefined;
  let bestD2 = maxPx * maxPx;
  for (let i = 0; i < n; i++) {
    if (!positionOf(i, p)) continue;
    const w = m[3]! * p[0] + m[7]! * p[1] + m[11]! * p[2] + m[15]!;
    if (w <= 0) continue; // behind the camera
    const x = (m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2] + m[12]!) / w;
    const y = (m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2] + m[13]!) / w;
    const sx = ((x + 1) / 2) * view.width;
    const sy = ((1 - y) / 2) * view.height;
    const d2 = (sx - px) ** 2 + (sy - py) ** 2;
    if (d2 < bestD2 && !hiddenByEarth(view.camera, p)) {
      bestD2 = d2;
      best = i;
    }
  }
  return best;
}
