import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Next to the PWA (5174) and the admin dashboard (5175). Pinned, with
    // strictPort, because cloudflared's ingress rule for
    // salon-landing.fahadmir.me dials 127.0.0.1:5176 — if Vite quietly moved
    // to another port the tunnel would answer 502.
    port: 5176,
    strictPort: true,
    // Lets the dev server answer to the public tunnel hostname — see
    // services/frontend/vite.config.ts for the same setting.
    allowedHosts: true,
    // With VITE_API_BASE_URL=/api, Pricing fetches live plans from this
    // origin and Vite forwards them to Django, so no CORS setup is needed.
    proxy: {
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: true },
    },
  },
});
