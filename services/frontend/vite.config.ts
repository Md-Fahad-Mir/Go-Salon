import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  server: {
    host: '0.0.0.0',
    port: 5174,
    allowedHosts: true,

    /* The API, reached through this server rather than around it.
     *
     * The browser asks its own origin for `/api/...`, and this proxies it to
     * Django. That matters because the *phone* is the one making the request:
     * `localhost` on a phone is the phone, and a LAN address baked into the
     * client goes stale the next time DHCP hands out a different one. A
     * relative path cannot go stale — whatever host the page was loaded from
     * is the host the API is asked for, and only this process, running on the
     * same machine as Django, needs to know where Django actually is.
     *
     * It also removes two problems rather than configuring around them: the
     * request is same-origin, so no CORS preflight is issued, and
     * `changeOrigin` presents `Host: 127.0.0.1:8000` to Django, so
     * `ALLOWED_HOSTS` never sees the LAN address either.
     *
     * Dev only. `server` is not consulted by `vite build`, so a production
     * bundle still calls whatever `VITE_API_BASE_URL` says at build time.
     */
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      /* The hair-AI service (services/ai), for the same reason and with one
         difference: it serves `/analyze` and `/generate` at its root rather
         than under a prefix, so the prefix that routes the request here is
         taken back off before it is forwarded.

         Not in the original brief, which named `/api` and `/ws`. It is here
         because `VITE_AI_API_URL` was pointing at 192.168.23.73 — an address
         this machine last held two DHCP leases ago — so the try-on flow was
         broken on every device including the Mac. Leaving it would have left
         an IP in client config, which is the thing being removed. */
      /* `^/ai/` as a REGEX, not the bare prefix `/ai`. Vite matches a plain
         string key with `startsWith`, so `/ai` also claims `/ai-tryon` —
         the app's own try-on routes — and forwards a page navigation to
         FastAPI, which answers `{"detail":"Not Found"}`. Anchoring on the
         trailing slash is what keeps the two apart. */
      '^/ai/': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ai/, ''),
      },

      /* Django's admin, and the static files it serves itself. Here so the
         admin console opens from whatever origin the app was loaded from —
         including a phone — rather than from a host written into the client.
         Vite serves nothing under `/static`, so there is no collision. */
      '/admin': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/static': { target: 'http://127.0.0.1:8000', changeOrigin: true },

      /* The booking socket. `ws: true` is what makes the proxy handle the
         Upgrade handshake rather than answering it as ordinary HTTP — without
         it the connection is refused and the dashboards go quiet, which is a
         failure that looks like nothing at all. */
      '/ws': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        ws: true,
      },
    },
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