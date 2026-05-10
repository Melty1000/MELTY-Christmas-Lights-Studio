import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

const MANUAL_VENDOR_CHUNKS: Record<string, string> = {
  react: 'react-vendor',
  'react-dom': 'react-vendor',
  'react-router-dom': 'react-vendor',
  zustand: 'state-vendor',
  three: 'three-vendor',
  '@react-three/fiber': 'r3f-vendor',
  '@react-three/drei': 'r3f-vendor',
  '@react-three/postprocessing': 'postfx-vendor',
  postprocessing: 'postfx-vendor',
  'lucide-react': 'ui-vendor',
  gsap: 'ui-vendor',
  '@gsap/react': 'ui-vendor',
  clsx: 'ui-vendor',
};

function packageNameFromModuleId(id: string): string | null {
  const normalized = id.replace(/\\/g, '/');
  if (!normalized.includes('/node_modules/')) return null;

  const nodeModulePath = normalized.split('/node_modules/').pop();
  if (!nodeModulePath) return null;

  const [first, second] = nodeModulePath.split('/');
  if (!first) return null;
  return first.startsWith('@') && second ? `${first}/${second}` : first;
}

function manualChunks(id: string): string | undefined {
  const packageName = packageNameFromModuleId(id);
  return packageName ? MANUAL_VENDOR_CHUNKS[packageName] : undefined;
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '~': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // Bind to 127.0.0.1 explicitly. Vite's default on Node 20+/Windows binds
    // only to IPv6 `::1`, which breaks browsers that try `127.0.0.1` first
    // and refuse to fall back (Chromium on Windows is the common repro).
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:3001',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
});
