# ─── Stage 1: Build the Vite + React static site ─────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# Install ALL dependencies — Vite is a devDependency, so do NOT use --prod.
COPY package.json package-lock.json ./
RUN npm ci

# Build the static site → outputs to /app/dist
COPY . .
RUN npm run build

# ─── Stage 2: Serve the static files with Nginx ──────────────────────
FROM nginx:1.27-alpine AS runner

# curl is needed for the compose/container healthcheck
RUN apk add --no-cache curl

# SPA-aware Nginx config listening on port 3000 (matches compose base)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Ship the built assets
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000 || exit 1

CMD ["nginx", "-g", "daemon off;"]
