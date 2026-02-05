import "dotenv/config";
import { startBot } from "./telegram/bot.js";
import { logInfo, logError } from "./utils/logs.js";
import process from "process";

async function bootTelegramBot() {
  try {
    logInfo("🤖 Starting Telegram Bot...");

    // Start the bot
    await startBot();

    logInfo("✅ Telegram Bot is running");

    // Keep process alive safely
    process.on("unhandledRejection", (reason, p) => {
      logError("Unhandled Rejection at:", reason);
    });
    process.on("uncaughtException", (err) => {
      logError("Uncaught Exception:", err);
    });

  } catch (err) {
    logError("❌ Telegram Bot failed to start", err);
    process.exit(1); // Exit to allow supervisor to restart
  }
}

// Launch
bootTelegramBot();
