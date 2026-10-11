// Small immutable 3D vector helpers (copied from the game). Plain objects so they serialize as
// JSON and cross the worker boundary without conversion.

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const vec3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

export const add = (a: Vec3, b: Vec3): Vec3 => vec3(a.x + b.x, a.y + b.y, a.z + b.z);

export const sub = (a: Vec3, b: Vec3): Vec3 => vec3(a.x - b.x, a.y - b.y, a.z - b.z);

export const scale = (a: Vec3, k: number): Vec3 => vec3(a.x * k, a.y * k, a.z * k);

export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

export const cross = (a: Vec3, b: Vec3): Vec3 =>
  vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);

export const norm = (a: Vec3): number => Math.sqrt(dot(a, a));

/** Unit vector in the direction of `a`. Throws on the zero vector instead of returning NaNs. */
export const normalize = (a: Vec3): Vec3 => {
  const n = norm(a);
  if (n === 0) throw new Error('normalize: zero-length vector');
  return scale(a, 1 / n);
};
