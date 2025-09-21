import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { readdirSync, copyFileSync, existsSync, mkdirSync } from 'fs';

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    allowedHosts: ['ai-salvador.com', 'localhost', '127.0.0.1'],
    // Ensure assets are served from the correct path
    proxy: {},
  },
  publicDir: 'public',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
      output: {
        // Put assets in the right place
        assetFileNames: (assetInfo) => {
          // Font files
          const fontExtensions = ['.ttf', '.woff', '.woff2', '.eot', '.otf'];
          if (fontExtensions.some(ext => assetInfo.name?.endsWith(ext))) {
            return 'assets/fonts/[name][extname]';
          }
          // Other assets
          return 'assets/[name]-[hash][extname]';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
    // Don't inline any assets
    assetsInlineLimit: 0,
    // Copy public dir to dist
    copyPublicDir: true,
    // Output directory
    outDir: 'dist',
    // Clean output directory before build
    emptyOutDir: true,
  },
});
