import { describe, expect, it } from 'vitest';
import { SAMPLE_STEP_S } from './hermite';
import type { Sample } from './protocol';
import { gridIndex, gridTime, SampleStore } from './sampleStore';

const STEP = SAMPLE_STEP_S * 1000;
const sample = (t: number): Sample => ({
  t,
  pos: new Float32Array(3),
  vel: new Float32Array(3),
  ok: new Uint8Array(1),
  computeMs: 1,
});

describe('SampleStore', () => {
  it('asks for the two samples around t and the next one ahead, once each', () => {
    const asked: number[] = [];
    const store = new SampleStore((t) => asked.push(t));
    const t = gridTime(1000) + STEP / 3;
    expect(store.update(t, 1)).toBeUndefined();
    store.update(t, 1);
    expect(asked).toEqual([gridTime(1000), gridTime(1001), gridTime(1002)]);
  });

  it('asks for the previous sample when time runs backwards', () => {
    const asked: number[] = [];
    const store = new SampleStore((t) => asked.push(t));
    store.update(gridTime(50) + 10, -100);
    expect(asked).toContain(gridTime(49));
  });

  it('returns the bracket and the fraction once both samples are in', () => {
    const store = new SampleStore(() => {});
    const t = gridTime(7) + STEP / 4;
    store.update(t, 1);
    store.receive(sample(gridTime(7)));
    store.receive(sample(gridTime(8)));
    const b = store.update(t, 1);
    expect(b?.a.t).toBe(gridTime(7));
    expect(b?.b.t).toBe(gridTime(8));
    expect(b?.u).toBeCloseTo(0.25, 12);
  });

  it('after a jump, keeps showing the last complete picture until the new one is ready', () => {
    const store = new SampleStore(() => {});
    store.update(gridTime(7), 1);
    store.receive(sample(gridTime(7)));
    store.receive(sample(gridTime(8)));
    store.update(gridTime(7) + STEP / 2, 1);
    const held = store.update(gridTime(500), 1);
    expect(held?.a.t).toBe(gridTime(7));
    expect(held?.u).toBe(0.5); // frozen where it was
  });

  it('grid index is floor(t / step), also before 1970', () => {
    expect(gridIndex(STEP * 3 + 1)).toBe(3);
    expect(gridIndex(-1)).toBe(-1);
  });
});
