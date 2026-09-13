# syntax=docker/dockerfile:1
#
# Debian-based images on purpose: Alpine's musl libc has repeatedly caused
# subtle runtime/DNS/Prisma-engine issues once these images run in Kubernetes.

ARG NODE_VERSION=22-bookworm-slim

FROM node:${NODE_VERSION} AS base
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@12.4.1 --activate

# `prisma generate` only needs DATABASE_URL to be *set*, not reachable — it
# never connects to the database. Real values are injected at container
# runtime (compose env / k8s secret) and take precedence over this default.
ARG DATABASE_URL="postgresql://user:password@localhost:5432/db?schema=public"
ENV DATABASE_URL=${DATABASE_URL}

# NEXT_PUBLIC_* vars are inlined into the client bundle at `next build` time —
# unlike DATABASE_URL, a k8s Secret/ConfigMap at container runtime can't reach
# them. Must be passed as a --build-arg by CI. No fallback default: missing it
# should fail the build loudly (see config/wagmi.ts), not ship silently broken.
ARG NEXT_PUBLIC_PROJECT_ID
ENV NEXT_PUBLIC_PROJECT_ID=${NEXT_PUBLIC_PROJECT_ID}
# Escrow wiring (lib/escrow/config.ts). An empty factory address builds
# fine but leaves every campaign stuck in DRAFT.
ARG NEXT_PUBLIC_ESCROW_CHAIN_ID=133
ENV NEXT_PUBLIC_ESCROW_CHAIN_ID=${NEXT_PUBLIC_ESCROW_CHAIN_ID}
ARG NEXT_PUBLIC_ESCROW_FACTORY_ADDRESS
ENV NEXT_PUBLIC_ESCROW_FACTORY_ADDRESS=${NEXT_PUBLIC_ESCROW_FACTORY_ADDRESS}
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}

# ---- dependencies -----------------------------------------------------------
# --ignore-scripts: the prisma schema isn't copied in yet, so `postinstall`
# (prisma generate) is run explicitly in the stages below instead.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

# ---- development (used by compose.yml) -------------------------------------
FROM deps AS dev
COPY . .
RUN pnpm exec prisma generate
ENV NODE_ENV=development
EXPOSE 3000
CMD ["pnpm", "run", "dev"]

# ---- production build -------------------------------------------------------
FROM deps AS builder
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm exec prisma generate
RUN pnpm run build

# ---- production runtime -----------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs --create-home --home-dir /home/nextjs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
# Full node_modules (not just .prisma/@prisma) so the `prisma` CLI binary is
# available for `prisma migrate deploy` in the init container — otherwise
# npx tries to download it at runtime and fails (no network / no writable HOME).
COPY --from=builder /app/node_modules ./node_modules

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
