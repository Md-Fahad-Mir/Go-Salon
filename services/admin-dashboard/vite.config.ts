import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    // Lets the dev server answer to the public tunnel hostname
    // (salon-admin.fahadmir.me) rather than only localhost/127.0.0.1 — see
    // services/frontend/vite.config.ts for the same setting and why Vite
    // needs it explicitly.
    allowedHosts: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
})
