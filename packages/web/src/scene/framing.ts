// Camera framing math, kept apart from CameraRig.tsx so it can be tested without a browser.

/**
 * Camera distance [Earth radii] at which the Earth (radius 1) looks `radiusPx` pixels big
 * on a screen `heightPx` tall. The Earth's edge is seen at angle θ from the view centre
 * with sin θ = 1 / d; on screen that is (heightPx / 2) · tan θ / tan(fov / 2).
 */
export function distanceForRadius(radiusPx: number, heightPx: number, fovDeg: number): number {
  const tanHalfFov = Math.tan(((fovDeg / 2) * Math.PI) / 180);
  const theta = Math.atan((radiusPx / (heightPx / 2)) * tanHalfFov);
  return 1 / Math.sin(theta);
}
