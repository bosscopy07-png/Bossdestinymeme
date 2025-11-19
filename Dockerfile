# =====================================================================
# STAGE 1 — BUILDER
# =====================================================================
FROM node:20-slim AS builder

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    build-essential \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies (works even without lockfile)
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Copy full source
COPY . .

# Build step (ignored if not needed)
RUN npm run build || echo "No build script found"

# =====================================================================
# STAGE 2 — RUNTIME
# =====================================================================
FROM node:20-slim AS runtime

WORKDIR /app

# Install PM2 globally
RUN npm install -g pm2@5 --unsafe-perm

# Add user for security
RUN addgroup --system appgroup && adduser --system appuser --ingroup appgroup

# Copy built app + node_modules
COPY --from=builder /app /app

# Logs directory
RUN mkdir -p /app/logs && chown -R appuser:appgroup /app/logs

USER appuser

# Default API port
ENV PORT=5000
EXPOSE 5000

# Timezone for accurate logging
ENV TZ=Africa/Lagos

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "process.exit(require('fs').existsSync('./scanner/index.js') ? 0 : 1)"

# Start bot + scanner via PM2
CMD ["pm2-runtime", "ecosystem.config.js"]
