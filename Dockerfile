# Pinned by tag and digest, so a rebuild can't silently pull a different image (OWASP A03).
# Update both together, e.g. from https://hub.docker.com/_/node (Node 26 on Alpine).
ARG NODE_IMAGE=node:26.13.0-alpine3.24@sha256:c6ad9e9c1d80f6eb607c26b4b0a132ff7a2344fad1c78ea3baa2a7d4c8de6d94

# ---- base: Node + pnpm (Node 25+ no longer ships corepack) ----------------------------------
FROM ${NODE_IMAGE} AS base
# Keep in step with "packageManager" in package.json.
ARG PNPM_VERSION=12.14.0
RUN npm install --global --no-fund --no-audit pnpm@${PNPM_VERSION}
WORKDIR /app
# pnpm-workspace.yaml carries the build-script allowlist (argon2) and the release-age policy.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# ---- prod-deps: production dependencies only ------------------------------------------------
FROM base AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/var/cache/pnpm \
    pnpm install --store-dir /var/cache/pnpm --prod --frozen-lockfile

# ---- build: all dependencies, then compile TypeScript to dist/ ------------------------------
FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/var/cache/pnpm \
    pnpm install --store-dir /var/cache/pnpm --frozen-lockfile
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm run build

# ---- runtime: no pnpm, no compiler, no dev dependencies, no source, no secrets ---------------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Owned by root and read-only to the app: the running process can't modify its own code.
# package.json is needed at runtime for "type": "module".
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY --chmod=0555 docker/entrypoint.sh ./entrypoint.sh

# The official image already provides this unprivileged user (uid 1000).
USER node

# The app listens on $PORT (3000 unless configured). The check is a TCP connect, so it costs
# nothing and doesn't spend TMDB quota. start-period leaves room for the migrations.
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "const s=require('node:net').connect(Number(process.env.PORT||3000),'127.0.0.1');s.on('connect',()=>process.exit(0));s.on('error',()=>process.exit(1))"

# Configuration comes from environment variables at run time; there is no .env in the image.
ENTRYPOINT ["./entrypoint.sh"]
