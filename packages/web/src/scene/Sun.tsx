// The Sun in the sky (copied from the game): a disc at the Sun's real direction and
// real size, with a soft glow that does not dazzle. The same direction lights the Earth's day
// side (Earth.tsx), so light and Sun always agree.
//
// The Sun is so far away (1 AU = 149.6 million km, 23,000 Earth radii) that it must not
// shift as the camera moves around the Earth. So it is drawn a fixed distance in front of
// the camera, in its direction: like an object at infinity, it keeps its direction and size
// wherever the camera is, and the Earth (much closer) hides it when it is behind the Earth.

import { useFrame } from '@react-three/fiber';
import { sunDirectionEci } from '@sat-viewer/core';
import { useEffect, useMemo, useRef } from 'react';
import { AdditiveBlending, CanvasTexture, type Sprite, Vector3 } from 'three';
import { simClock } from '../state/simClock';
import { temeDirToScene } from './coords';

/** The Sun's radius [km] and the mean Earth–Sun distance, 1 AU [km] (IAU 2012) */
export const SUN_RADIUS_KM = 695_700;
export const AU_KM = 149_597_870.7;

/**
 * Angular diameter of the Sun seen from Earth: 2·asin(R☉ / d) = 0.533° at 1 AU. (Over the
 * year it changes by ±1.7%, as the distance does; we use the mean.)
 */
export const sunAngularDiameterRad = (distanceKm = AU_KM) =>
  2 * Math.asin(SUN_RADIUS_KM / distanceKm);

/** How far in front of the camera the Sun is drawn [Earth radii]; inside the far plane (1,000) */
const DRAW_DISTANCE = 600;
/** The glow is this many times the disc, faint and fading out */
const GLOW_SCALE = 14;

/** A round sprite texture: a sharp disc, slightly darker at the rim (limb darkening). */
function discTexture(): CanvasTexture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255, 252, 240, 1)');
  grad.addColorStop(0.8, 'rgba(255, 244, 214, 1)');
  grad.addColorStop(0.97, 'rgba(255, 226, 170, 1)');
  grad.addColorStop(1, 'rgba(255, 226, 170, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return new CanvasTexture(c);
}

/** The glow around it: brightest at the centre, fading smoothly to nothing. */
function glowTexture(): CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255, 236, 190, 0.55)');
  grad.addColorStop(0.12, 'rgba(255, 220, 160, 0.22)');
  grad.addColorStop(0.4, 'rgba(255, 200, 130, 0.05)');
  grad.addColorStop(1, 'rgba(255, 200, 130, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return new CanvasTexture(c);
}

export function Sun() {
  const disc = useRef<Sprite>(null);
  const glow = useRef<Sprite>(null);
  const textures = useMemo(() => ({ disc: discTexture(), glow: glowTexture() }), []);
  useEffect(
    () => () => {
      textures.disc.dispose();
      textures.glow.dispose();
    },
    [textures],
  );
  const dir = useMemo(() => new Vector3(), []);
  const diameter = DRAW_DISTANCE * 2 * Math.tan(sunAngularDiameterRad() / 2);

  useFrame(({ camera }) => {
    const [x, y, z] = temeDirToScene(sunDirectionEci(simClock.now()));
    dir.set(x, y, z);
    for (const s of [disc.current, glow.current]) {
      if (s) s.position.copy(camera.position).addScaledVector(dir, DRAW_DISTANCE);
    }
  });

  return (
    <>
      <sprite ref={glow} scale={[diameter * GLOW_SCALE, diameter * GLOW_SCALE, 1]} renderOrder={-1}>
        <spriteMaterial
          map={textures.glow}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
      <sprite ref={disc} scale={[diameter, diameter, 1]}>
        <spriteMaterial map={textures.disc} transparent depthWrite={false} toneMapped={false} />
      </sprite>
    </>
  );
}
