import { describe, expect, it } from 'vitest';
import {
  needsSharpTextures,
  screenPxPerRadius,
  SMALL_TILE_PX,
  texelsPerRadius,
} from './textureDetail';

const FOV = (45 * Math.PI) / 180; // App.tsx camera
const TAN = Math.tan(FOV / 2); // 0.414214

describe('texture detail', () => {
  it('counts texels and screen pixels per Earth radius', () => {
    expect(texelsPerRadius(SMALL_TILE_PX)).toBeCloseTo(651.9, 1); // 2048 / π
    // Start view (~6.7 radii out), 1080 px tall: 1080 / (2 · 5.7 · 0.4142) ≈ 228.7
    expect(screenPxPerRadius(6.7, FOV, 1080)).toBeCloseTo(1080 / (2 * 5.7 * TAN), 6);
    expect(screenPxPerRadius(1, FOV, 1080)).toBe(Infinity);
  });

  it('the start view keeps the small textures, also on a high-density screen', () => {
    expect(needsSharpTextures(6.7, FOV, 1080)).toBe(false);
    expect(needsSharpTextures(6.7, FOV, 2160)).toBe(false);
  });

  it('switches at d = 1 + h / (2 tan(fov/2) · 2048/π): about 3.0 radii at 1080 px, 5.0 at 2160 px', () => {
    expect(needsSharpTextures(3.01, FOV, 1080)).toBe(false);
    expect(needsSharpTextures(2.99, FOV, 1080)).toBe(true);
    expect(needsSharpTextures(5.01, FOV, 2160)).toBe(false);
    expect(needsSharpTextures(4.99, FOV, 2160)).toBe(true);
    // Following a low satellite puts the camera just above the ground.
    expect(needsSharpTextures(1.1, FOV, 800)).toBe(true);
  });
});
