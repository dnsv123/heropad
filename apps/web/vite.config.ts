import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// TODO: add path aliases (e.g. @/components) when components grow.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
  },
  preview: {
    port: 4173,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
