// FILE: index.js
import dotenv from "dotenv";
dotenv.config();

import { scanNewTokens } from "./core/scanner.js";
import bot from "./telegram/bot.js";        // Make sure this path is correct
import pino from "pino";

const logger = pino({
  name: "App",
  level: process.env.LOG_LEVEL || "info",
});

(async () => {
  try {
    // Start Telegram bot
    await bot.launch();
    logger.info("⚡ Telegram Bot Running...");

    // Start scanner
    scanNewTokens();
    logger.info("🐉 Hyper Beast Scanner — Phase 2 Active...");
  } catch (err) {
    logger.error({ err }, "Failed to start application");
    process.exit(1);
  }
})();
