// FILE: telegram/bot.js
import { Telegraf } from "telegraf";
import config from "../config/index.js";
import { logInfo, logError } from "../utils/logs.js";
import TelegramHandlers from "./handlers.js";
import UI from "./ui.js";
import { sendAdminNotification } from "./sender.js";

// Prefer explicit TELEGRAM_BOT_TOKEN but fall back to other names/env
const TELEGRAM_TOKEN =
  config.TELEGRAM_BOT_TOKEN ||
  config.BOT_TOKEN ||
  process.env.TELEGRAM_BOT_TOKEN ||
  process.env.BOT_TOKEN;

if (!TELEGRAM_TOKEN) {
  throw new Error("❌ TELEGRAM_BOT_TOKEN is missing in config or env");
}

// Create bot instance
const bot = new Telegraf(TELEGRAM_TOKEN, {
  handlerTimeout: 60_000,
  telegram: { apiRoot: "https://api.telegram.org" },
});

// Instantiate handlers once and register them
const handlers = new TelegramHandlers(bot);
handlers.init();

// Optional: keep a simple /start fallback in case UI or handlers change
// (handlers.init already registers /start; this is safe and idempotent)
bot.start(async (ctx) => {
  try {
    // UI.startMessage() is expected to return MarkdownV2-safe text
    await ctx.replyWithMarkdownV2(UI.startMessage(), UI.startKeyboard());
    logInfo(`User ${ctx.from?.username || ctx.from?.id} used /start`);
  } catch (err) {
    logError("Error in /start fallback", err);
    try {
      if (config.ADMIN_CHAT_ID) {
        await sendAdminNotification(bot, `❗ /start fallback error: ${err.message}`);
      }
    } catch (e) {
      logError("Failed to notify admin about /start fallback error", e);
    }
  }
});

// NOTE: TelegramHandlers.init() already registers callback_query, text, etc.
// But keep a global safety wrapper that forwards unknown callback queries to the instance
bot.on("callback_query", async (ctx) => {
  try {
    // prefer calling the class method that handles callbacks (named `callback` in your handlers)
    if (typeof handlers.callback === "function") {
      await handlers.callback(ctx);
    } else if (typeof handlers.handleCallback === "function") {
      await handlers.handleCallback(ctx);
    } else {
      // last-resort: answer the query so the user doesn't see a spinner forever
      await ctx.answerCbQuery("Unhandled callback");
      logInfo("Callback received but no handler method found");
    }
  } catch (err) {
    logError("Error handling callback_query (global wrapper)", err);
    try { await ctx.answerCbQuery("Error processing action"); } catch {}
  }
});

// Global error catcher (Telegraf)
bot.catch(async (err, ctx) => {
  logError("Telegram bot error", err);
  try {
    if (ctx && ctx.reply) {
      await ctx.reply("⚠️ An unexpected bot error occurred. Admin has been notified.");
    }
  } catch (_) {}

  try {
    if (config.ADMIN_CHAT_ID) {
      await sendAdminNotification(bot, `❗ Bot Error\n${err?.message || String(err)}`);
    }
  } catch (e) {
    logError("Failed to send admin notification from bot.catch", e);
  }
});

// Exposed start function — call this from your index/startup
export async function startTelegramBot() {
  try {
    // Bot should already have handlers registered above, but ensure launched once
    await bot.launch();
    logInfo("🚀 Telegram bot launched successfully");

    if (config.ADMIN_CHAT_ID) {
      try {
        await sendAdminNotification(bot, "🤖 Bot Started Successfully");
      } catch (e) {
        logError("Failed to send startup admin notification", e);
      }
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
    try {
      if (config.ADMIN_CHAT_ID) {
        await sendAdminNotification(bot, `❗ Failed to start bot: ${err?.message || err}`);
      }
    } catch (_) {}
    throw err;
  }
}

// Default export: bot instance (useful for other modules)
export default bot;
