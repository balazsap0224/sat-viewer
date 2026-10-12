import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { gmst, sunDirectionEci } from '@sat-viewer/core';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  type Group,
  MathUtils,
  type PerspectiveCamera,
  type ShaderMaterial,
  SRGBColorSpace,
  type Texture,
  Vector3,
} from 'three';
import { temeDirToScene } from './coords';
import { createEarthMaterial } from './earthMaterial';
import { EARTH_TILES, TILE_HEIGHT_SEGMENTS, TILE_WIDTH_SEGMENTS } from './earthTiles';
import { needsSharpTextures } from './textureDetail';
import { simClock } from '../state/simClock';

/** Loaded at start: 2048 px per half, 1.35 MB in all (textureDetail.ts). */
const SMALL_TEXTURES = {
  dayWest: '/textures/earth-day-west-small.jpg',
  dayEast: '/textures/earth-day-east-small.jpg',
  nightWest: '/textures/earth-night-west-small.jpg',
  nightEast: '/textures/earth-night-east-small.jpg',
};

/** Loaded only once the camera comes close: 5400 px per half, 8.2 MB in all. */
const SHARP_TEXTURES = {
  dayWest: '/textures/earth-day-west.jpg',
  dayEast: '/textures/earth-day-east.jpg',
  nightWest: '/textures/earth-night-west.jpg',
  nightEast: '/textures/earth-night-east.jpg',
};

type EarthMaps = Record<keyof typeof SMALL_TEXTURES, Texture>;
type EarthMaterials = Record<'west' | 'east', ShaderMaterial>;

function prepare(maps: EarthMaps) {
  for (const map of Object.values(maps)) {
    map.colorSpace = SRGBColorSpace;
    map.anisotropy = 8;
  }
}

/**
 * The Earth, radius 1 (scene units are Earth radii), drawn as two textured half-spheres
 * (earthTiles.ts).
 *
 * Texture alignment: three's sphere puts longitude 0° (Greenwich) on the +x axis and
 * 90° E on −z. With the TEME → scene mapping in coords.ts, that is exactly ECEF +x and +y,
 * so the unrotated globe is the ECEF frame. Rotating it by θ = GMST about the scene's
 * y axis (the North Pole) turns ECEF into TEME.
 *
 * The globe starts with small textures and swaps in the sharp ones the first time the
 * camera comes close enough to need them (textureDetail.ts).
 */
export function Earth() {
  const maps = useTexture(SMALL_TEXTURES);
  const sunDirection = useMemo(() => new Vector3(1, 0, 0), []);

  const materials = useMemo<EarthMaterials>(() => {
    prepare(maps);
    return {
      west: createEarthMaterial(maps.dayWest, maps.nightWest, sunDirection),
      east: createEarthMaterial(maps.dayEast, maps.nightEast, sunDirection),
    };
  }, [maps, sunDirection]);

  const globe = useRef<Group>(null);
  const [wantSharp, setWantSharp] = useState(false);

  useFrame(({ camera, size, viewport }) => {
    if (!wantSharp) {
      const fov = MathUtils.degToRad((camera as PerspectiveCamera).fov);
      if (needsSharpTextures(camera.position.length(), fov, size.height * viewport.dpr)) {
        setWantSharp(true);
      }
    }

    const t = simClock.now();
    if (globe.current) globe.current.rotation.y = gmst(t);
    const [x, y, z] = temeDirToScene(sunDirectionEci(t));
    sunDirection.set(x, y, z);
  });

  return (
    <group ref={globe}>
      {EARTH_TILES.map((tile) => (
        <mesh key={tile.name} material={materials[tile.name]}>
          <sphereGeometry
            args={[1, TILE_WIDTH_SEGMENTS, TILE_HEIGHT_SEGMENTS, tile.phiStart, tile.phiLength]}
          />
        </mesh>
      ))}
      {wantSharp && (
        // Its own Suspense: while the sharp textures download, the small ones stay on show.
        <Suspense fallback={null}>
          <SharpTextures materials={materials} small={maps} />
        </Suspense>
      )}
    </group>
  );
}

/** Downloads the sharp textures, puts them into the materials and frees the small ones. */
function SharpTextures({ materials, small }: { materials: EarthMaterials; small: EarthMaps }) {
  const sharp = useTexture(SHARP_TEXTURES);
  // Mark them as sRGB during render: drei sends new textures to the GPU in an effect, and an
  // upload made before the colour space is set would read them as linear, so the Earth would
  // come out washed out and the night side lavender instead of dark (found 2026-10-12).
  useMemo(() => prepare(sharp), [sharp]);

  useEffect(() => {
    materials.west.uniforms.dayMap!.value = sharp.dayWest;
    materials.west.uniforms.nightMap!.value = sharp.nightWest;
    materials.east.uniforms.dayMap!.value = sharp.dayEast;
    materials.east.uniforms.nightMap!.value = sharp.nightEast;
    // Frees their GPU memory (about 90 MB); three uploads them again if they are ever reused.
    for (const map of Object.values(small)) map.dispose();
  }, [sharp, materials, small]);

  return null;
}
