import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // The SGP4 worker (src/sim/propagation.worker.ts) imports modules, so it is an ES module.
  worker: { format: 'es' },
});
