// Performance numbers for the fps readout (SPEC.md 7.3: 60 fps target): frames per second and
// how long the worker takes per SGP4 sample over all objects.

let frames = 0;
let windowStart = performance.now();
let fps = 0;
let sampleMs = 0;

export const perfStats = {
  /** Call once per rendered frame. */
  frame() {
    frames++;
    const now = performance.now();
    if (now - windowStart >= 1000) {
      fps = (frames * 1000) / (now - windowStart);
      frames = 0;
      windowStart = now;
    }
  },
  recordSample(ms: number) {
    // Smoothed, so the readout does not flicker.
    sampleMs = sampleMs === 0 ? ms : 0.8 * sampleMs + 0.2 * ms;
  },
  get: () => ({ fps, sampleMs }),
};
