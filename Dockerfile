# =====================================================================
# STAGE 1 — BUILDER
# =====================================================================
FROM node:20-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    build-essential \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npm run build || echo "No build step"

# =====================================================================
# STAGE 2 — RUNTIME
# =====================================================================
FROM node:20-slim AS runtime

WORKDIR /app

RUN addgroup --system appgroup && adduser --system appuser --ingroup appgroup

COPY --from=builder /app /app

RUN mkdir -p /app/logs && chown -R appuser:appgroup /app
USER appuser

ENV NODE_ENV=production
ENV TZ=Africa/Lagos

# ❌ DO NOT SET PORT
# ❌ DO NOT EXPOSE A FIXED PORT

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "require('http').get('http://localhost:' + process.env.PORT + '/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "api/server.js"]
