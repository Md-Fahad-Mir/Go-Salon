import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  server: {
    host: '0.0.0.0',
    port: 5174,
    allowedHosts: true,
  },

  preview: {
    port: 4174,
  },

  build: {
    target: 'es2022',
    sourcemap: false,
    // The service worker reads this to precache every hashed chunk, so the app
    // opens offline even on a route the user has not visited yet.
    manifest: true,
  },
});