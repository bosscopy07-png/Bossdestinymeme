// FILE: telegram/bot.js
import { Telegraf } from "telegraf";
import config from "../config/index.js";
import { logInfo, logError } from "../utils/logs.js";
import TelegramHandlers from "./handlers.js";
import { sendAdminNotification } from "./sender.js";

/* ======================================================
   LOAD TOKEN SAFELY
====================================================== */
const TELEGRAM_TOKEN =
  config.TELEGRAM_BOT_TOKEN ||
  config.BOT_TOKEN ||
  process.env.TELEGRAM_BOT_TOKEN ||
  process.env.BOT_TOKEN;

if (!TELEGRAM_TOKEN) {
  throw new Error("❌ TELEGRAM_BOT_TOKEN missing");
}

/* ======================================================
   CREATE BOT INSTANCE
====================================================== */
const bot = new Telegraf(TELEGRAM_TOKEN, {
  handlerTimeout: 60_000,
});

/* ======================================================
   REGISTER HANDLERS (SINGLE SOURCE)
====================================================== */
const handlers = new TelegramHandlers(bot);
handlers.init();

/* ======================================================
   GLOBAL ERROR HANDLER
====================================================== */
bot.catch(async (err, ctx) => {
  logError("Telegram global error", err);

  try {
    if (ctx?.reply) {
      await ctx.reply("⚠️ Unexpected error occurred. Admin notified.");
    }
  } catch {}

  try {
    if (config.ADMIN_CHAT_ID) {
      await sendAdminNotification(
        bot,
        `❗ Telegram Bot Error:\n${err.message}`
      );
    }
  } catch {}
});

/* ======================================================
   SAFE LAUNCH (SINGLETON)
====================================================== */
let launched = false;

export async function startTelegramBot() {
  if (launched) {
    logInfo("Telegram bot already running — launch skipped");
    return;
  }

  launched = true;

  try {
    await bot.launch();
    logInfo("🚀 Telegram bot launched");

    if (config.ADMIN_CHAT_ID) {
      await sendAdminNotification(
        bot,
        [
          "🤖 *Telegram Bot Started*",
          `• PID: ${process.pid}`,
          `• Mode: ${config.TRADING_MODE || "unknown"}`,
          `• Environment: ${process.env.NODE_ENV || "production"}`,
        ].join("\n")
      );
    }

    /* ---------- GRACEFUL SHUTDOWN ---------- */
    const shutdown = (signal) => {
      logInfo(`Stopping Telegram bot (${signal})`);
      bot.stop(signal);
      process.exit(0);
    };

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);

  } catch (err) {
    logError("❌ Failed to launch Telegram bot", err);

    if (config.ADMIN_CHAT_ID) {
      await sendAdminNotification(
        bot,
        `❗ Telegram startup failed:\n${err.message}`
      );
    }

    process.exit(1); // supervisor restarts
  }
}

/* ======================================================
   EXPORT BOT INSTANCE
====================================================== */
export default bot;
