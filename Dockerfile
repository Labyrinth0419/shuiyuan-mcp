# ---- Build stage ----
FROM node:24-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first (layer cache)
COPY package.json pnpm-lock.yaml ./
RUN corepack pnpm install --frozen-lockfile

# Copy source and build
COPY tsconfig.json ./
COPY src/ src/
RUN corepack pnpm build

# ---- Runtime stage ----
FROM node:24-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built artifacts and production deps
COPY package.json pnpm-lock.yaml ./
RUN corepack pnpm install --frozen-lockfile --prod
COPY --from=builder /app/dist/ dist/

# Default data dir inside container
ENV SHUIYUAN_DATA_DIR=/data

VOLUME ["/data"]

# stdio transport (default for MCP clients)
# For HTTP: pass --transport http --port 3765
ENTRYPOINT ["node", "dist/shuiyuan-mcp.js"]
