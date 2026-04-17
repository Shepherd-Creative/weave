# syntax=docker/dockerfile:1.7
#
# Multi-stage build for @shepherd-creative/weave-mcp-server.
#
# Strategy: build inside the monorepo (we need workspace-linked access to
# weave-primitives and weave-skill), then use `pnpm deploy` to produce a
# standalone package with all transitive deps flattened into node_modules.
# Runtime image copies only the deployed slice — no pnpm, no workspace
# protocol, no build tools.
#
# Built image is ~180MB (node:22-alpine base ~60MB + runtime deps).

# ---------- Stage 1: build ----------
FROM node:22-alpine AS builder

# pnpm via corepack — version comes from root package.json's packageManager
# field, so upgrading the monorepo's pnpm version automatically rebuilds
# this image on the next CI run.
RUN corepack enable

WORKDIR /app

# Copy monorepo manifests first so Docker can cache the install layer when
# only source files change.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
# Workspace packages referenced by pnpm-workspace.yaml — pnpm-lock.yaml
# expects all of them to exist even when we only build a subset. We copy
# just the package.json files (cheap, doesn't invalidate cache when
# sources change).
COPY packages/weave-primitives/package.json ./packages/weave-primitives/
COPY packages/weave-skill/package.json ./packages/weave-skill/
COPY packages/weave-mcp-server/package.json ./packages/weave-mcp-server/
COPY packages/weave-tokens/package.json ./packages/weave-tokens/
COPY apps/docs/package.json ./apps/docs/
COPY examples/copilotkit-next/package.json ./examples/copilotkit-next/

# Install all workspace deps (frozen to the committed lockfile).
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy sources for the three packages actually needed by the MCP server,
# then build them in dependency order via turbo. weave-primitives and
# weave-skill must ship dist/ before mcp-server's build reads them.
COPY packages/weave-primitives/ ./packages/weave-primitives/
COPY packages/weave-skill/ ./packages/weave-skill/
COPY packages/weave-mcp-server/ ./packages/weave-mcp-server/
COPY turbo.json tsconfig.base.json ./

RUN pnpm --filter "@shepherd-creative/weave-mcp-server..." build

# Produce a standalone deployment under /app/deploy with only the
# mcp-server package and its runtime dependencies (workspace deps are
# flattened into node_modules). `--prod` drops devDeps.
# `--legacy` is required since pnpm v10 — we don't use injected workspace
# packages, so the legacy deploy strategy (flatten workspace deps into
# node_modules) is the right model.
RUN pnpm --filter "@shepherd-creative/weave-mcp-server" deploy --legacy --prod /app/deploy

# ---------- Stage 2: runtime ----------
FROM node:22-alpine AS runtime

# Run as a non-root user. The Alpine node image already ships a `node`
# user with UID 1000.
WORKDIR /app

COPY --from=builder --chown=node:node /app/deploy/ ./

# Non-root drop AFTER files are in place.
USER node

# MCP server binds to 0.0.0.0 (via @hono/node-server defaults) on the port
# from WEAVE_MCP_PORT, default 8787. EXPOSE is purely documentation;
# docker-compose wires the actual network.
ENV WEAVE_MCP_PORT=8787 \
    NODE_ENV=production
EXPOSE 8787

# Health probe — hits the same /health endpoint the local dev server
# exposes. `node -e ...` avoids needing wget/curl in the image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
