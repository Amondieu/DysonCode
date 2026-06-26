import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import electronRenderer from 'vite-plugin-electron-renderer';
import path from 'path';

const ROOT = __dirname;

export default defineConfig({
  root: path.join(ROOT, 'src/renderer'),
  base: './',
  build: {
    outDir: path.join(ROOT, 'dist/renderer'),
  },
  plugins: [
    react(),
    electron([
      {
        entry: path.join(ROOT, 'src/main/preload.ts'),
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            outDir: path.join(ROOT, 'dist/main'),
            rollupOptions: {
              external: ['electron'],
              output: { format: 'cjs' },
            },
            minify: false,
          },
        },
      },
    ]),
    electronRenderer(),
  ],
  resolve: {
    alias: {
      '@': path.join(ROOT, 'src'),
      '@main': path.join(ROOT, 'src/main'),
      '@renderer': path.join(ROOT, 'src/renderer'),
    },
  },
});
