// FILE: api/server.js
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import routes from "./routes.js";
import config from "../config/index.js";
import { logInfo, logError } from "../utils/logs.js";

// Optional: Auto-start Telegram bot here
// import { startTelegramBot } from "../telegram/bot.js";

// --------------------------------------------------
// CREATE APP INSTANCE
// --------------------------------------------------
const app = express();

// --------------------------------------------------
// SECURITY MIDDLEWARE
// --------------------------------------------------
app.use(
  helmet({
    xssFilter: true,
    noSniff: true,
    hidePoweredBy: true,
    frameguard: { action: "deny" },
    crossOriginResourcePolicy: false,
    crossOriginEmbedderPolicy: false
  })
);

// --------------------------------------------------
// CORS CONFIG (SAFE DEFAULT, OVERRIDDEN BY ENV)
// --------------------------------------------------
app.use(
  cors({
    origin: config.API?.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

// --------------------------------------------------
// JSON PARSER (FAIL-SAFE)
// --------------------------------------------------
app.use(
  express.json({
    limit: "2mb",
    strict: false,
    verify: (req, res, buf) => {
      try {
        JSON.parse(buf.toString());
      } catch (_) {
        throw new Error("INVALID_JSON_PAYLOAD");
      }
    }
  })
);

// --------------------------------------------------
// RATE LIMITING (ANTI-BOT / ANTI-DDOS)
// --------------------------------------------------
app.use(
  rateLimit({
    windowMs: 10 * 1000, // 10 seconds
    max: 120,
    message: { error: "too_many_requests" },
    standardHeaders: true,
    legacyHeaders: false
  })
);

// --------------------------------------------------
// REQUEST LOGGER (ONLY DEV MODE)
// --------------------------------------------------
if (config.NODE_ENV === "development") {
  app.use((req, res, next) => {
    logInfo(`HTTP ${req.method} ${req.originalUrl}`);
    next();
  });
}

// --------------------------------------------------
// MAIN ROUTES
// --------------------------------------------------
app.use("/api", routes);

// --------------------------------------------------
// HEALTHCHECK (SELF-HEAL READY)
// --------------------------------------------------
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: Date.now(),
    env: config.NODE_ENV || "unknown"
  });
});

// --------------------------------------------------
// GLOBAL ERROR HANDLER
// --------------------------------------------------
app.use((err, req, res, next) => {
  logError("API ERROR → " + (err?.stack || err?.message || err));

  res.status(err?.status || 500).json({
    error: "internal_error",
    message: config.NODE_ENV === "development" ? err.message : undefined
  });
});

// --------------------------------------------------
// SERVER BOOT FUNCTION
// --------------------------------------------------
export async function startServer(
  port = config.API?.PORT || config.api?.PORT || 5000
) {
  const normalizedPort = Number(port);

  try {
    // ------------------------------------------
    // OPTIONAL: startup tasks (DB, cache, bot)
    // ------------------------------------------
    // await startTelegramBot();

    const server = app.listen(normalizedPort, () => {
      logInfo(`🚀 API server running on port ${normalizedPort}`);
    });

    // Graceful shutdown
    const shutdown = (signal) => {
      logInfo(`⚠ Received ${signal}. Shutting down...`);
      server.close(() => {
        logInfo("Server closed. Exiting now.");
        process.exit(0);
      });
    };

    ["SIGINT", "SIGTERM"].forEach((sig) =>
      process.on(sig, () => shutdown(sig))
    );

    return app;
  } catch (err) {
    logError("❌ Failed to start server:", err);
    process.exit(1);
  }
}

// --------------------------------------------------
// AUTO-START WHEN RUN DIRECTLY
// --------------------------------------------------
if (import.meta.url.endsWith("/api/server.js")) {
  startServer();
}

export default app;
