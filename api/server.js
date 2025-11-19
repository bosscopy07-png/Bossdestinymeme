// FILE: api/server.js
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import routes from "./routes.js";
import config from "../config/index.js";
import { logInfo, logError } from "../utils/logs.js";

// --------------------------------------------
// CREATE APP INSTANCE
// --------------------------------------------
const app = express();

// --------------------------------------------
// CORE SECURITY MIDDLEWARES
// --------------------------------------------
app.use(
  helmet({
    xssFilter: true,
    noSniff: true,
    hidePoweredBy: true,
    frameguard: { action: "deny" }
  })
);

// Allow only essential origins unless user overrides
app.use(
  cors({
    origin: config.API?.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

// Prevent malformed JSON from crashing server
app.use(express.json({ limit: "1mb", strict: true }));

// --------------------------------------------
// SMART RATE LIMITING (ANTI-BOT / ANTI-DDOS)
// --------------------------------------------
app.use(
  rateLimit({
    windowMs: 10 * 1000,     // 10s high-frequency window
    max: 120,                // max requests per window
    message: { error: "too_many_requests" },
    standardHeaders: true,
    legacyHeaders: false
  })
);

// --------------------------------------------
// OPTIONAL: REQUEST LOGGER (DEV MODE)
// --------------------------------------------
if (config.NODE_ENV === "development") {
  app.use((req, res, next) => {
    logInfo(`HTTP ${req.method} ${req.originalUrl}`);
    next();
  });
}

// --------------------------------------------
// MOUNT MAIN ROUTES
// --------------------------------------------
app.use("/api", routes);

// --------------------------------------------
// HEALTHCHECK ENDPOINT
// --------------------------------------------
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: Date.now(),
    env: config.NODE_ENV || "unknown"
  });
});

// --------------------------------------------
// GLOBAL ERROR HANDLER
// --------------------------------------------
app.use((err, req, res, next) => {
  logError("API Error → " + (err?.stack || err?.message || err));

  res.status(err?.status || 500).json({
    error: "internal_error",
    message: config.NODE_ENV === "development" ? err.message : undefined
  });
});

// --------------------------------------------
// SERVER BOOT FUNCTION
// --------------------------------------------
export function startServer(
  port = config?.API?.PORT || config?.api?.port || 5000
) {
  const normalizedPort = Number(port);

  try {
    const server = app.listen(normalizedPort, () => {
      logInfo(`🌐 API server running on port ${normalizedPort}`);
    });

    // Graceful shutdown
    process.on("SIGINT", () => {
      logInfo("Shutting down server (SIGINT)");
      server.close(() => process.exit(0));
    });

    process.on("SIGTERM", () => {
      logInfo("Shutting down server (SIGTERM)");
      server.close(() => process.exit(0));
    });

    return app;
  } catch (err) {
    logError("❌ Failed to start API server", err);
    process.exit(1);
  }
}

// --------------------------------------------
// AUTO-START IF RUN DIRECTLY
// --------------------------------------------
if (
  process.argv[1]?.endsWith("/api/server.js") ||
  import.meta.url.endsWith("/api/server.js")
) {
  startServer();
}

export default app;
