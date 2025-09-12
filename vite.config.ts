import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  // Use root by default (Netlify) and allow override via VITE_BASE_URL for subpath deployments
  base: process.env.VITE_BASE_URL || '/',
  plugins: [react()],
  server: {
    allowedHosts: ['ai-town-your-app-name.fly.dev', 'localhost', '127.0.0.1'],
  },
});
