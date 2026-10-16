# syntax=docker/dockerfile:1

# Base image with pnpm available via corepack.
FROM node:24-alpine AS base
# libc6-compat helps Next's native binaries run on alpine (musl).
RUN apk add --no-cache libc6-compat
RUN corepack enable
WORKDIR /app

# Install all dependencies (including dev, needed to build).
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Build the standalone server bundle.
FROM deps AS builder
COPY . .
# DATABASE_URL is not used at build time, but set a dummy so nothing trips on it.
ENV DATABASE_URL="postgres://build:build@localhost:5432/build"
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# Lightweight image used only to run migrations (has source + drizzle SQL + deps).
FROM deps AS migrator
COPY src ./src
COPY drizzle ./drizzle
COPY drizzle.config.ts tsconfig.json ./
# DATABASE_URL is provided at runtime by the environment.
CMD ["node", "src/lib/db/migrate.ts"]

# Minimal runtime image: just the standalone server and static assets.
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Run as a non-root user.
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
