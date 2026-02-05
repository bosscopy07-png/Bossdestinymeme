import dotenv from "dotenv";
dotenv.config();

import express from "express";
import pino from "pino";

import { scanNewTokens } from "./scanner/index.js";
import { startTelegramBot } from "./telegram/bot.js";
import { startApiServer } from "./api/app.js";           // optional
import { startTradingEngine } from "./trader/engine.js"; // optional

const logger = pino({
  name: "HyperBeastBot",
  level: process.env.LOG_LEVEL || "info",
});

async function startAll() {
  try {
    logger.info("🚀 Booting Hyper Beast Scanner...");

    // 1️⃣ Start Telegram Bot
    await startTelegramBot();
    logger.info("⚡ Telegram Bot Running...");

    // 2️⃣ Start Token Scanner (fire-and-forget if long-running)
    scanNewTokens().catch(err => logger.error({ err }, "Scanner loop error"));

    // 3️⃣ Optional components
    await startApiServer();
    await startTradingEngine();

    logger.info("✅ All systems active");

  } catch (err) {
    logger.error({ err }, "❌ Startup failed");
    process.exit(1);
  }
}

// Launch core
startAll();

// --- Minimal Health Check Web Server ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Hyper Beast Scanner Running — Powered by Destiny Olatunji");
});

app.listen(PORT, () => {
  logger.info(`🌐 Web server listening on http://localhost:${PORT}`);
});

// --- Global Error Handling ---
process.on("unhandledRejection", (reason, promise) => {
  logger.error({ reason, promise }, "Unhandled Promise Rejection");
});

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught Exception");
  // Optional: auto-exit so process manager restarts
  process.exit(1);
});
