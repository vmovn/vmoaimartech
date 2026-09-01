# syntax=docker/dockerfile:1.7
# Swiffer — multi-stage production image.
# TanStack Start SSR bundled with Vite; runs on Node 22.

# ---------- 1. Dependencies ----------
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable && apk add --no-cache libc6-compat
COPY package.json package-lock.json .npmrc ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --global npm@11.6.2 && npm ci

# ---------- 2. Build ----------
FROM node:22-alpine AS build
WORKDIR /app
ENV NODE_ENV=production \
    DEPLOY_TARGET=node
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Public build-time env (VITE_*) is baked in here.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_APP_ENV=production
ARG APP_VERSION=4.4.6
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_APP_ENV=$VITE_APP_ENV \
    APP_VERSION=$APP_VERSION
RUN npm run build

# ---------- 3. Production dependencies ----------
FROM deps AS production-deps
RUN npm prune --omit=dev

# ---------- 4. Runtime ----------
FROM node:22-alpine AS runtime
ARG APP_VERSION=4.4.6
LABEL org.opencontainers.image.title="Swiffer" \
      org.opencontainers.image.description="Swiffer omnichannel messaging platform" \
      org.opencontainers.image.version="$APP_VERSION" \
      org.opencontainers.image.vendor="Swiffer"
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    APP_VERSION=$APP_VERSION
RUN addgroup -S swiffer && adduser -S swiffer -G swiffer
COPY --from=build --chown=swiffer:swiffer /app/.output ./.output
COPY --from=production-deps --chown=swiffer:swiffer /app/node_modules ./node_modules
COPY --from=build --chown=swiffer:swiffer /app/package.json ./package.json
COPY --from=build --chown=swiffer:swiffer /app/app.js ./app.js
COPY --from=build --chown=swiffer:swiffer /app/scripts/product ./scripts/product
COPY --from=build --chown=swiffer:swiffer /app/supabase/migrations ./supabase/migrations

USER swiffer
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/api/public/health || exit 1

CMD ["npm", "run", "product:start"]
