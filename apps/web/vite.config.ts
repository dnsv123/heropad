import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Aliases keep imports clean and let the build resolve @heropad/shared even when
// npm workspace symlinks are not present (e.g. some Vercel install modes).
//
// envDir points to the repo root so a single .env file at the top level powers
// both `apps/web` (this file) and any future tooling — no need to duplicate keys
// in apps/web/.env. On Vercel, env vars come from Project Settings, not files.
//
// node-polyfills shims `buffer`, `process`, and a few other Node-only globals
// that @privy-io/react-auth and @solana/web3.js rely on when they run in the
// browser. Without it, you get "Cannot access buffer.Buffer in client code".
export default defineConfig({
  envDir: path.resolve(__dirname, '../..'),
  plugins: [
    react(),
    nodePolyfills({
      // Only shim what the Solana / Privy SDKs actually reach for. Adding more
      // grows the bundle without benefit.
      include: ['buffer', 'process', 'util', 'stream', 'crypto'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@heropad/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
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
