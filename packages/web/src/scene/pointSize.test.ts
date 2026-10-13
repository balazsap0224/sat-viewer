import { describe, expect, it } from 'vitest';
import { globeRadiusPx, POINT_MAX_PX, POINT_MIN_PX, pointSizePx } from './pointSize';

const SCALE = 1 / Math.tan((45 * Math.PI) / 180 / 2); // App.tsx camera, fov 45°: 2.414214
const START_DISTANCE = Math.hypot(1.6, 6.5); // App.tsx start position: 6.694 radii

describe('satellite dot size', () => {
  it('globe radius on screen: at d = √2 the edge is 45° off-centre', () => {
    // fov 90° (scale 1), 1000 px tall: tan 45° = 1 → 500 px
    expect(globeRadiusPx(Math.SQRT2, 1, 1000)).toBeCloseTo(500, 9);
    expect(globeRadiusPx(1, SCALE, 1000)).toBe(Infinity);
  });

  it('start view on a desktop (950 px tall): globe ≈ 173 px, dots ≈ 1.56 px', () => {
    const r = globeRadiusPx(START_DISTANCE, SCALE, 950);
    expect(r).toBeCloseTo(173.3, 1);
    expect(pointSizePx(r)).toBeCloseTo(1.56, 2);
  });

  it('start view on a phone (844 px tall): the smallest dot', () => {
    expect(pointSizePx(globeRadiusPx(START_DISTANCE, SCALE, 844))).toBe(POINT_MIN_PX);
  });

  it('zoomed in (3 radii out) and above the ground: full size', () => {
    expect(pointSizePx(globeRadiusPx(3, SCALE, 950))).toBe(POINT_MAX_PX);
    expect(pointSizePx(globeRadiusPx(1, SCALE, 950))).toBe(POINT_MAX_PX);
  });

  it('far out (30 radii, the zoom limit): the smallest dot', () => {
    expect(pointSizePx(globeRadiusPx(30, SCALE, 1440))).toBe(POINT_MIN_PX);
  });
});
