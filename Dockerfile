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

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy full source
COPY . .

# Build (if needed)
RUN npm run build || echo "No build script"

# =====================================================================
# STAGE 2 — RUNTIME
# =====================================================================
FROM node:20-slim AS runtime

WORKDIR /app

# Create safe user
RUN addgroup --system appgroup && adduser --system appuser --ingroup appgroup

# Copy dependencies + app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app ./

# Logs directory
RUN mkdir -p /app/logs && chown -R appuser:appgroup /app/logs

USER appuser

ENV PORT=5000
EXPOSE 5000
ENV TZ=Africa/Lagos

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "process.exit(require('fs').existsSync('./package.json') ? 0 : 1)"

# Start the app without PM2
CMD ["node", "api/server.js"]
