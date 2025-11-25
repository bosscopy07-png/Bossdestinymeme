// FILE: telegram/bot.js
import { Telegraf } from "telegraf";
import config from "../config/index.js";
import { logInfo, logError } from "../utils/logs.js";
import TelegramHandlers from "./handlers.js";
import { sendAdminNotification } from "./sender.js";

// ----------------------------
// BOT INITIALIZATION
// ----------------------------
if (!config.TELEGRAM_BOT_TOKEN) {
  throw new Error("❌ TELEGRAM_BOT_TOKEN is missing in config");
}

const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN, {
  handlerTimeout: 60_000,
  telegram: { apiRoot: "https://api.telegram.org" },
});

// ----------------------------
// BOT LAUNCH FUNCTION
// ----------------------------
export async function startTelegramBot() {
  try {
    // Attach all handlers BEFORE launching bot
    new TelegramHandlers(bot).init();

    // Global error handler
    bot.catch(async (err, ctx) => {
      logError("Telegram bot error", err);

      try {
        await ctx.reply("⚠️ An unexpected bot error occurred.\nAdmin has been notified.");
      } catch (_) {}

      if (config.ADMIN_CHAT_ID) {
        await sendAdminNotification(bot, `❗ Bot Error\n${err.message}`);
      }
    });

    // Launch bot
    await bot.launch();
    logInfo("🚀 Telegram bot launched successfully");

    // Notify admin on start
    if (config.ADMIN_CHAT_ID) {
      await sendAdminNotification(bot, "🤖 Bot Started Successfully");
    }

    // Graceful shutdown
    process.once("SIGINT", () => {
      bot.stop("SIGINT");
      logInfo("Bot stopped via SIGINT");
    });

    process.once("SIGTERM", () => {
      bot.stop("SIGTERM");
      logInfo("Bot stopped via SIGTERM");
    });

  } catch (err) {
    logError("❌ Failed to start Telegram Bot", err);
  }
}

// ----------------------------
// EXPORT BOT INSTANCE
// ----------------------------
export default bot;
