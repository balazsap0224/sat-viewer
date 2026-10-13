// How big the satellite dots are drawn.
//
// Low orbit is crowded: about 10,000 Starlinks fly in shells a few dozen km thick. From far
// away, a fixed 2.5-pixel dot per satellite covers about a third of the globe's face, and
// along the globe's edge, where we look through the shell sideways, the dots merge into a
// blue band that looks like an atmosphere (owner, 2026-10-13). So low-orbit dots scale with
// the globe: the share of the globe they cover stays the same when zooming out, and they reach
// full size once the globe is large on screen. Higher orbits are sparse (a few hundred
// geostationary satellites on a ring 6.6 Earth radii from the centre) and keep full size, so the
// geostationary belt stays visible.

/** Full dot diameter [CSS px] */
export const POINT_MAX_PX = 2.5;
/** Smallest dot diameter [CSS px], still clearly visible on a 1× screen */
export const POINT_MIN_PX = 1.4;
/**
 * Dot diameter per pixel of the globe's radius on screen. 0.009 covers about a tenth of the
 * globe's face with the ~8,000 low-orbit dots on the near side (a third at 2.5 px on a phone).
 */
const POINT_PER_GLOBE_PX = 0.009;

/**
 * The globe's radius on screen [CSS px].
 *
 * The globe has radius 1 and the camera is d radii from its centre, so the angle from the
 * centre of the globe to its edge, seen from the camera, is asin(1/d), and tan(asin(1/d)) =
 * 1 / √(d² − 1). A perspective camera draws a direction at tan(angle) · scale · height / 2
 * pixels from the middle of the screen, where scale = 1 / tan(fov / 2).
 *
 * @param cameraDistance distance from the Earth's centre [Earth radii]
 * @param projectionScale the projection matrix's y scale (element 5), 1 / tan(fov / 2)
 * @param heightPx drawing height [CSS px]
 */
export function globeRadiusPx(
  cameraDistance: number,
  projectionScale: number,
  heightPx: number,
): number {
  if (cameraDistance <= 1) return Infinity;
  return (projectionScale * heightPx) / 2 / Math.sqrt(cameraDistance * cameraDistance - 1);
}

/** Low-orbit dot diameter [CSS px] for a globe of this radius on screen [CSS px] */
export function pointSizePx(globeRadius: number): number {
  return Math.min(POINT_MAX_PX, Math.max(POINT_MIN_PX, POINT_PER_GLOBE_PX * globeRadius));
}
