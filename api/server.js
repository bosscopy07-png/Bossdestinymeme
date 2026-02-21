// FILE: api/server.js
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import routes from "./routes.js";
import config from "../config/index.js";
import { logInfo, logError } from "../utils/logs.js";
import { startTelegramBot } from "../telegram/bot.js";

// --------------------------------------------------
// CREATE EXPRESS APP
// --------------------------------------------------
const app = express();

// --------------------------------------------------
// SECURITY MIDDLEWARE
// --------------------------------------------------
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    crossOriginEmbedderPolicy: false
  })
);

// --------------------------------------------------
// CORS
// --------------------------------------------------
app.use(
  cors({
    origin: config.API?.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

// --------------------------------------------------
// JSON PARSER
// --------------------------------------------------
app.use(
  express.json({
    limit: "2mb"
  })
);

// --------------------------------------------------
// RATE LIMITING
// --------------------------------------------------
app.use(
  rateLimit({
    windowMs: 10 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false
  })
);

// --------------------------------------------------
// DEV LOGGER
// --------------------------------------------------
if (config.NODE_ENV === "development") {
  app.use((req, _res, next) => {
    logInfo(`HTTP ${req.method} ${req.originalUrl}`);
    next();
  });
}

// --------------------------------------------------
// ROUTES
// --------------------------------------------------
app.use("/api", routes);

// --------------------------------------------------
// HEALTHCHECK
// --------------------------------------------------
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: Date.now()
  });
});

app.get("/", (_req, res) => {
  res.send("BossDestiny Meme API — running");
});

// --------------------------------------------------
// ERROR HANDLER
// --------------------------------------------------
app.use((err, _req, res, _next) => {
  logError("API ERROR →", err);
  res.status(500).json({ error: "internal_error" });
});

// --------------------------------------------------
// SERVER START (RENDER-SAFE)
// --------------------------------------------------
let serverStarted = false;

export async function startServer() {
  if (serverStarted) return;
  serverStarted = true;

  const PORT = Number(process.env.PORT);

  if (!PORT) {
    throw new Error("❌ process.env.PORT is required (Render/Docker)");
  }

  // Start Telegram bot ONCE
  //await startTelegramBot();

  app.listen(PORT, "0.0.0.0", () => {
    logInfo(`🚀 API server listening on port ${PORT}`);
  });
}

// --------------------------------------------------
// AUTO START (ONLY WHEN RUN DIRECTLY)
// --------------------------------------------------
if (process.argv[1]?.includes("api/server.js")) {
  startServer().catch(err => {
    logError("Startup failed", err);
    process.exit(1);
  });
}

export default app;
