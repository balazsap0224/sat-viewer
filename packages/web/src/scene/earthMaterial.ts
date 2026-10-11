// Day/night Earth shader (SPEC.md 11.2): Blue Marble on the sunlit side, Black Marble
// city lights on the dark side, blended across a soft twilight band.

import { ShaderMaterial, type Texture, type Vector3 } from 'three';

/**
 * Width of the twilight band, as the sine of the Sun's elevation. The Sun is fully up
 * at +TWILIGHT and fully down at −TWILIGHT; ±0.1 is about ±6°, roughly civil twilight.
 */
const TWILIGHT = 0.1;

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalWorld;

  void main() {
    vUv = uv;
    // World-space normal: the mesh only rotates (no scaling), so the model matrix works.
    vNormalWorld = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform vec3 sunDirection; // unit vector, world (scene) space

  varying vec2 vUv;
  varying vec3 vNormalWorld;

  void main() {
    // Sine of the Sun's elevation above the local horizon at this point.
    float sunElevation = dot(normalize(vNormalWorld), sunDirection);
    float dayAmount = smoothstep(-${TWILIGHT.toFixed(3)}, ${TWILIGHT.toFixed(3)}, sunElevation);

    // Day side: a little Lambert shading so the globe reads as a sphere, never fully dark.
    vec3 day = texture2D(dayMap, vUv).rgb * (0.35 + 0.65 * max(sunElevation, 0.0));
    // Night side: city lights, slightly boosted so they read against black.
    vec3 night = texture2D(nightMap, vUv).rgb * 1.4;

    gl_FragColor = vec4(mix(night, day, dayAmount), 1.0);
    #include <colorspace_fragment>
  }
`;

/**
 * @param sunDirection shared by reference between the tiles of the globe, so one update
 *   per frame moves the terminator on every tile.
 */
export function createEarthMaterial(
  dayMap: Texture,
  nightMap: Texture,
  sunDirection: Vector3,
): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      dayMap: { value: dayMap },
      nightMap: { value: nightMap },
      sunDirection: { value: sunDirection },
    },
    vertexShader,
    fragmentShader,
  });
}
