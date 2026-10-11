import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { gmst, sunDirectionEci } from '@sat-viewer/core';
import { useMemo, useRef } from 'react';
import { type Group, SRGBColorSpace, Vector3 } from 'three';
import { temeDirToScene } from './coords';
import { createEarthMaterial } from './earthMaterial';
import { EARTH_TILES, TILE_HEIGHT_SEGMENTS, TILE_WIDTH_SEGMENTS } from './earthTiles';
import { simClock } from '../state/simClock';

const TEXTURES = {
  dayWest: '/textures/earth-day-west.jpg',
  dayEast: '/textures/earth-day-east.jpg',
  nightWest: '/textures/earth-night-west.jpg',
  nightEast: '/textures/earth-night-east.jpg',
};

/**
 * The Earth, radius 1 (scene units are Earth radii), drawn as two textured half-spheres
 * (earthTiles.ts).
 *
 * Texture alignment: three's sphere puts longitude 0° (Greenwich) on the +x axis and
 * 90° E on −z. With the TEME → scene mapping in coords.ts, that is exactly ECEF +x and +y,
 * so the unrotated globe is the ECEF frame. Rotating it by θ = GMST about the scene's
 * y axis (the North Pole) turns ECEF into TEME.
 */
export function Earth() {
  const maps = useTexture(TEXTURES);
  const sunDirection = useMemo(() => new Vector3(1, 0, 0), []);

  const materials = useMemo(() => {
    for (const map of Object.values(maps)) {
      map.colorSpace = SRGBColorSpace;
      map.anisotropy = 8;
    }
    return {
      west: createEarthMaterial(maps.dayWest, maps.nightWest, sunDirection),
      east: createEarthMaterial(maps.dayEast, maps.nightEast, sunDirection),
    };
  }, [maps, sunDirection]);

  const globe = useRef<Group>(null);

  useFrame(() => {
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
    </group>
  );
}
