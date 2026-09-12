# syntax=docker/dockerfile:1
# Production image of the Astro SSR server (Node adapter, standalone). Two stages: the build stage carries the whole
# toolchain, the runtime stage only the production dependencies and the built server. Configuration (SUPABASE_URL,
# SUPABASE_KEY, OPENROUTER_*) is read from the environment when the container runs (astro:env); nothing is baked in.

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# `supabase` (a devDependency) downloads its CLI binary in postinstall; it stays in this stage.
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine AS runtime
LABEL org.opencontainers.image.source="https://github.com/janwychowaniak/mindagora"
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080
WORKDIR /app
COPY package.json package-lock.json ./
# The standalone server imports its dependencies from node_modules at runtime, hence a production install here.
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 8080
# /login is public and goes through the middleware: 200 means the server, the session layer and the env are fine.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/login" || exit 1
CMD ["node", "dist/server/entry.mjs"]
