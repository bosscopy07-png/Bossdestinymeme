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
// INIT HANDLERS
// ----------------------------
const handlers = new TelegramHandlers(bot);
handlers.init();

// ----------------------------
// GLOBAL ERROR HANDLER
// ----------------------------
bot.catch(async (err, ctx) => {
  logError("Telegram bot error", err);

  try {
    await ctx.reply("⚠️ An unexpected bot error occurred.\nAdmin has been notified.");
  } catch (_) {}

  if (config.ADMIN_CHAT_ID) {
    await sendAdminNotification(bot, `❗ Bot Error\n${err.message}`);
  }
});

// ----------------------------
// BOT LAUNCH FUNCTION
// ----------------------------
export async function startTelegramBot() {
  try {
    await bot.launch();
    logInfo("🚀 Telegram bot launched successfully");

    // Notify admin that bot is online
    if (config.ADMIN_CHAT_ID) {
      await sendAdminNotification(bot, "🤖 Bot Started Successfully");
    }

    // Graceful shutdown handlers
    process.once("SIGINT", () => {
      bot.stop("SIGINT");
      logInfo("Bot stopped via SIGINT");
    });

    process.once("SIGTERM", () => {
      bot.stop("SIGTERM");
      logInfo("Bot stopped via SIGTERM");
    });

  } catch (err) {
    logError("❌ Failed to launch bot", err);
    process.exit(1);
  }
}

// Export bot instance
export default bot;
