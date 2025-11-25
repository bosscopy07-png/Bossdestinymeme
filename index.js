// FILE: index.js
import dotenv from "dotenv";
dotenv.config();

import { scanNewTokens } from "./core/scanner.js";
import { startTelegramBot } from "./telegram/bot.js";
import pino from "pino";
import express from "express";

const logger = pino({
  name: "App",
  level: process.env.LOG_LEVEL || "info",
});

(async () => {
  try {
    // Start Telegram bot PROPERLY
    await startTelegramBot();
    logger.info("⚡ Telegram Bot Running...");

    // Start scanner
    scanNewTokens();
    logger.info("🐉 Hyper Beast Scanner — Phase 2 Active...");
  } catch (err) {
    logger.error({ err }, "Failed to start application");
    process.exit(1);
  }
})();

// -------------------------
// Render Port Binding Fix
// -------------------------

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Hyper Beast Scanner Running — Powered by Destiny Olatunji");
});

app.listen(PORT, () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});
