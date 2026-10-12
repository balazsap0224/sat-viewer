// When the globe needs its sharp textures.
//
// The globe starts with small textures (2048 × 2048 per half, about 9.8 km per texel at the
// equator, 1.35 MB in all) and downloads the sharp ones (5400 × 5400, about 3.7 km per texel,
// 8.2 MB) only once the camera comes close enough for the difference to show. Most visits
// never zoom in that far, so they never pay for the big download.
//
// "Close enough" means: on the ground straight below the camera, one screen pixel covers
// less than one texel of the small texture, so the small texture would start to look blurry.

/** Width and height of one small texture tile [px] (public/textures/*-small.jpg) */
export const SMALL_TILE_PX = 2048;

/**
 * Texels per Earth radius along the equator. One tile covers half the equator, which is
 * π Earth radii long (the full circumference is 2π radii).
 */
export function texelsPerRadius(tilePx: number): number {
  return tilePx / Math.PI;
}

/**
 * Screen pixels per Earth radius on the ground straight below the camera.
 *
 * That point is (d − 1) radii from the camera (d = camera distance from the Earth's centre,
 * the globe's radius is 1). A perspective camera with vertical field of view `fov` sees a
 * strip 2 (d − 1) tan(fov / 2) radii tall at that distance, spread over `heightPx` pixels.
 *
 * @param cameraDistance distance from the Earth's centre [Earth radii]
 * @param fovRad vertical field of view [rad]
 * @param heightPx drawing height in device pixels (CSS height × devicePixelRatio)
 */
export function screenPxPerRadius(
  cameraDistance: number,
  fovRad: number,
  heightPx: number,
): number {
  const range = cameraDistance - 1;
  if (range <= 0) return Infinity;
  return heightPx / (2 * range * Math.tan(fovRad / 2));
}

/** True once the small textures would show fewer texels than screen pixels. */
export function needsSharpTextures(
  cameraDistance: number,
  fovRad: number,
  heightPx: number,
): boolean {
  return screenPxPerRadius(cameraDistance, fovRad, heightPx) > texelsPerRadius(SMALL_TILE_PX);
}
