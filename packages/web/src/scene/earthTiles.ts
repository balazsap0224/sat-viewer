// The globe is drawn as two half-spheres, each with its own 5400 × 5400 texture, because
// one 10800-px texture exceeds many laptop GPUs' maximum texture size (see
// scripts/prepare-textures.mjs).
//
// three's SphereGeometry sweeps the angle phi from phiStart to phiStart + phiLength, and
// its texture u always runs 0 → 1 across that sweep. phi = 0 is the −x axis, which the
// full-sphere mapping assigns to longitude −180°. So phi = 0..π is longitude −180°..0°
// (the "west" texture) and phi = π..2π is 0°..180° (the "east" texture).

export interface EarthTile {
  readonly name: 'west' | 'east';
  readonly phiStart: number;
  readonly phiLength: number;
  /** Longitude [deg] at the tile's left edge (u = 0). */
  readonly lonStartDeg: number;
}

export const EARTH_TILES: readonly EarthTile[] = [
  { name: 'west', phiStart: 0, phiLength: Math.PI, lonStartDeg: -180 },
  { name: 'east', phiStart: Math.PI, phiLength: Math.PI, lonStartDeg: 0 },
];

/** Sphere segments per tile: 64 around (half of 128) and 64 from pole to pole. */
export const TILE_WIDTH_SEGMENTS = 64;
export const TILE_HEIGHT_SEGMENTS = 64;
