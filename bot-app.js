
import "dotenv/config";
import process from "process";

import { startBot } from "./telegram/bot.js";
import { logInfo, logError, logWarn } from "./utils/logs.js";

// ----------------------
// BOOT TELEGRAM BOT
// ----------------------
async function bootTelegramBot() {
  try {
    logInfo("🤖 Booting Telegram Bot");

    await startBot();

    logInfo("✅ Telegram Bot running");
  } catch (err) {
    logError("❌ Telegram Bot failed to start", err);
    process.exit(1); // Let PM2 / Railway / Docker restart it
  }
}

// ----------------------
// GRACEFUL SHUTDOWN
// ----------------------
let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  logWarn(`🛑 Telegram bot shutting down (${signal})`);

  try {
    // Future-safe:
    // await bot.stop();
  } catch (err) {
    logError("Shutdown error", err);
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// ----------------------
// CRASH GUARDS
// ----------------------
process.on("unhandledRejection", (reason) => {
  logError("🔥 Unhandled Promise Rejection", reason);
});

process.on("uncaughtException", (err) => {
  logError("💥 Uncaught Exception", err);
  process.exit(1);
});

// ----------------------
// START BOT
// ----------------------
bootTelegramBot();

// ----------------------
// HEARTBEAT (LIVENESS)
// ----------------------
setInterval(() => {
  logInfo("🤖 Telegram bot alive");
}, 60_000);
