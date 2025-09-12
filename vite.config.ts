import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  // Use root path for deployment
  base: '/',
  plugins: [react()],
  server: {
    allowedHosts: ['ai-salvador.netlify.app', 'localhost', '127.0.0.1'],
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
    assetsDir: 'assets',
    emptyOutDir: true,
  },
  publicDir: 'public',
});
