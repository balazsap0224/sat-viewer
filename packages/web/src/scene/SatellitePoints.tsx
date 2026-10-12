// All satellites as points (SPEC.md 7.1, 7.3).
//
// One draw call for every object: a THREE.Points cloud whose vertex shader places each point
// on the Hermite curve between two SGP4 samples (sim/hermite.ts). The worker sends a sample
// every SAMPLE_STEP_S seconds of shown time; between samples only one number changes per
// frame (u, how far along), so the CPU does almost nothing per frame.
//
// Points are coloured by orbit class ([PROPOSED] SPEC.md 7.1). Objects SGP4 cannot propagate
// at either end of the bracket are hidden (SPEC.md 6.1 step 6), and so are objects the
// filters leave out (`mask`).
//
// The current bracket and mask are also handed to satField.ts, for picking on the CPU.

import { useFrame } from '@react-three/fiber';
import type { OrbitClass } from '@sat-viewer/core';
import type { ElementRow } from '@sat-viewer/shared';
import { useEffect, useMemo, useRef } from 'react';
import { BufferAttribute, BufferGeometry, Color, ShaderMaterial } from 'three';
import { SAMPLE_STEP_S } from '../sim/hermite';
import type { FromWorker, Sample, ToWorker } from '../sim/protocol';
import { type Bracket, SampleStore } from '../sim/sampleStore';
import { simClock } from '../state/simClock';
import { perfStats } from '../state/perfStats';
import { satField } from './satField';

/** Point colours per orbit class (also used by the legend) */
export const ORBIT_CLASS_COLORS: Record<OrbitClass, string> = {
  LEO: '#7cc4ff',
  MEO: '#45d69b',
  GEO: '#ffc857',
  IGSO: '#ff9f43',
  HEO: '#ff8fb1',
};

const vertexShader = /* glsl */ `
  attribute vec3 posA;
  attribute vec3 velA;
  attribute vec3 posB;
  attribute vec3 velB;
  attribute float okAB;
  attribute vec3 color;

  uniform float u;       // 0..1 between sample A and sample B
  uniform float h;       // seconds between the samples
  uniform float pointPx; // point size in pixels

  varying vec3 vColor;

  void main() {
    vColor = color;
    // Cubic Hermite basis (sim/hermite.ts)
    float u2 = u * u;
    float u3 = u2 * u;
    vec3 p = (2.0 * u3 - 3.0 * u2 + 1.0) * posA
           + (u3 - 2.0 * u2 + u) * h * velA
           + (-2.0 * u3 + 3.0 * u2) * posB
           + (u3 - u2) * h * velB;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    // Hidden objects: put them outside the clip volume.
    if (okAB < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = pointPx;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;

  void main() {
    // Round points with a soft edge.
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.3, d);
    gl_FragColor = vec4(vColor, alpha);
    #include <colorspace_fragment>
  }
`;

export interface SatellitePointsProps {
  readonly rows: readonly ElementRow[];
  /** Orbit class per row, for the colour */
  readonly classes: readonly OrbitClass[];
  /** 1 = passes the filters, 0 = hidden */
  readonly mask: Uint8Array;
  /** 1 = debris fragment: drawn in DEBRIS_COLOR whatever its orbit class */
  readonly debris: Uint8Array;
}

/** Debris colour (also used by the legend) */
export const DEBRIS_COLOR = '#8d939c';

export function SatellitePoints({ rows, classes, mask, debris }: SatellitePointsProps) {
  const n = rows.length;

  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    const f3 = () => new BufferAttribute(new Float32Array(3 * n), 3);
    // `position` is unused by the shader but three needs it to know the vertex count.
    g.setAttribute('position', f3());
    g.setAttribute('posA', f3());
    g.setAttribute('velA', f3());
    g.setAttribute('posB', f3());
    g.setAttribute('velB', f3());
    g.setAttribute('okAB', new BufferAttribute(new Float32Array(n), 1));
    const colors = new Float32Array(3 * n);
    const c = new Color();
    classes.forEach((cls, i) => {
      c.set(debris[i] ? DEBRIS_COLOR : ORBIT_CLASS_COLORS[cls]);
      colors.set([c.r, c.g, c.b], 3 * i);
    });
    g.setAttribute('color', new BufferAttribute(colors, 3));
    return g;
  }, [classes, debris, n]);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          u: { value: 0 },
          h: { value: SAMPLE_STEP_S },
          pointPx: { value: 2.5 * Math.min(window.devicePixelRatio, 2) },
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
      }),
    [],
  );

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  // The worker and the sample store live as long as this set of rows.
  const store = useRef<SampleStore | undefined>(undefined);
  const shown = useRef<{ a: Sample; b: Sample; mask: Uint8Array } | undefined>(undefined);

  useEffect(() => {
    satField.setMask(mask);
  }, [mask]);
  useEffect(() => () => satField.setBracket(undefined), []);

  useEffect(() => {
    const worker = new Worker(new URL('../sim/propagation.worker.ts', import.meta.url), {
      type: 'module',
    });
    const send = (msg: ToWorker) => worker.postMessage(msg);
    let ready = false;
    const queue: number[] = [];
    const s = new SampleStore((t) => (ready ? send({ type: 'sample', t }) : queue.push(t)));
    worker.onmessage = (e: MessageEvent<FromWorker>) => {
      const msg = e.data;
      if (msg.type === 'ready') {
        ready = true;
        for (const t of queue.splice(0)) send({ type: 'sample', t });
      } else {
        perfStats.recordSample(msg.computeMs);
        s.receive(msg);
      }
    };
    send({ type: 'init', rows });
    store.current = s;
    shown.current = undefined;
    return () => {
      worker.terminate();
      store.current = undefined;
    };
  }, [rows]);

  const upload = (bracket: Bracket) => {
    const set = (name: string, data: Float32Array) => {
      const attr = geometry.getAttribute(name) as BufferAttribute;
      (attr.array as Float32Array).set(data);
      attr.needsUpdate = true;
    };
    set('posA', bracket.a.pos);
    set('velA', bracket.a.vel);
    set('posB', bracket.b.pos);
    set('velB', bracket.b.vel);
    const ok = geometry.getAttribute('okAB') as BufferAttribute;
    const okArr = ok.array as Float32Array;
    for (let i = 0; i < n; i++) okArr[i] = bracket.a.ok[i] && bracket.b.ok[i] && mask[i] ? 1 : 0;
    ok.needsUpdate = true;
  };

  useFrame(() => {
    const s = store.current;
    if (!s) return;
    const bracket = s.update(simClock.now(), simClock.getState().rate);
    if (!bracket) return;
    const sh = shown.current;
    if (sh?.a !== bracket.a || sh.b !== bracket.b || sh.mask !== mask) {
      upload(bracket);
      shown.current = { a: bracket.a, b: bracket.b, mask };
    }
    satField.setBracket(bracket);
    (material.uniforms.u as { value: number }).value = bracket.u;
    (material.uniforms.h as { value: number }).value = (bracket.b.t - bracket.a.t) / 1000;
  });

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}
