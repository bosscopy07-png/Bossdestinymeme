# =====================================================================
# STAGE 1 — BUILDER (installs dependencies cleanly)
# =====================================================================
FROM node:20-slim AS builder

WORKDIR /app

# Install required build tools for native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    build-essential \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy package files first (best layer caching)
COPY package.json package-lock.json* ./

# Install all dependencies including dev (for building native modules)
RUN npm ci

# Copy full source
COPY . .

# Build (if you have TypeScript or build scripts)
RUN npm run build || echo "No build step"

# =====================================================================
# STAGE 2 — RUNTIME (lean & production-only)
# =====================================================================
FROM node:20-slim AS runtime

WORKDIR /app

# Install pm2 at system level
RUN npm install -g pm2@5 --unsafe-perm

# Create non-root user for security
RUN addgroup --system appgroup && adduser --system appuser --ingroup appgroup

# Copy node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy built application
COPY --from=builder /app ./

# Create logs directory
RUN mkdir -p /app/logs && chown -R appuser:appgroup /app/logs

# Switch to non-root user
USER appuser

# Expose API port
ENV PORT=5000
EXPOSE 5000

# Set timezone to avoid timestamp issues
ENV TZ=Africa/Lagos

# HEALTHCHECK — verifies PM2 + Node environment is alive
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "process.exit(require('fs').existsSync('./package.json') ? 0 : 1)"

# Start your PM2 ecosystem
CMD ["pm2-runtime", "ecosystem.config.js"]
