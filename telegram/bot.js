// FILE: telegram/bot.js
import { Telegraf } from "telegraf";
import config from "../config/index.js";
import { logInfo, logError } from "../utils/logs.js";

import {
  registerUser,
  handleCallback,
  handleStartCommand,
  handleSettingsCommand,
  handleModeCommand,
  handleSniperToggle,
  handleWatchlistCommand,
  handleAdminCommand,
  sendMessageToAdmin
} from "./handlers.js";

import { sendAdminNotification } from "./sender.js";

// ----------------------------
// BOT INITIALIZATION
// ----------------------------
if (!config.TELEGRAM_BOT_TOKEN) {
  throw new Error("❌ TELEGRAM_BOT_TOKEN is missing in config");
}

const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN, {
  handlerTimeout: 60_000, // Prevent deadlocks
  telegram: { apiRoot: "https://api.telegram.org" }
});

// ----------------------------
// GLOBAL ERROR HANDLER
// ----------------------------
bot.catch(async (err, ctx) => {
  logError("Telegram bot error", err);

  try {
    await ctx.reply("⚠️ An unexpected bot error occurred.\nAdmin has been notified.");
  } catch (_) {}

  await sendAdminNotification(bot, `❗ *Bot Error*\n${err.message}`);
});

// ----------------------------
// COMMAND HANDLERS
// ----------------------------

// /start
bot.start(async (ctx) => {
  try {
    await registerUser(ctx);
    await handleStartCommand(ctx);
  } catch (err) {
    logError("Error in /start", err);
  }
});

// /settings
bot.command("settings", async (ctx) => {
  try {
    await handleSettingsCommand(ctx);
  } catch (err) {
    logError("Error in /settings", err);
  }
});

// /mode — switch presets
bot.command("mode", async (ctx) => {
  try {
    await handleModeCommand(ctx);
  } catch (err) {
    logError("Error in /mode", err);
  }
});

// /sniper — toggle sniper mode
bot.command("sniper", async (ctx) => {
  try {
    await handleSniperToggle(ctx);
  } catch (err) {
    logError("Error in /sniper", err);
  }
});

// /watchlist
bot.command("watchlist", async (ctx) => {
  try {
    await handleWatchlistCommand(ctx);
  } catch (err) {
    logError("Error in /watchlist", err);
  }
});

// /admin — owner-only actions
bot.command("admin", async (ctx) => {
  try {
    await handleAdminCommand(ctx);
  } catch (err) {
    logError("Error in /admin", err);
  }
});

// ----------------------------
// CALLBACK HANDLER
// (SNIPER_*, WATCH_*, DETAILS_*)
// ----------------------------
bot.on("callback_query", async (ctx) => {
  try {
    await handleCallback(bot, ctx);
  } catch (err) {
    logError("Callback error", err);
    try {
      await ctx.answerCbQuery("❗ Error occurred");
    } catch (_) {}
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
      await sendAdminNotification(bot, "*🤖 Bot Started Successfully*");
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

// Export bot instance (used in other modules)
export default bot;
