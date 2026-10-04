import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    // Binds the IPv4 loopback explicitly. Without a `host`, Vite listens on
    // whatever 'localhost' resolves to on this machine, which came back
    // IPv6 (`[::1]:5175`) — a different socket than the `127.0.0.1:5175`
    // cloudflared's ingress rule targets, so the tunnel got a 502 with
    // nothing listening on the address it actually dials.
    host: '127.0.0.1',
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
