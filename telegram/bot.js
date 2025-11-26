
// FILE: telegram/bot.js
import { Telegraf } from "telegraf";
import config from "../config/index.js";
import { logInfo, logError } from "../utils/logs.js";
import TelegramHandlers from "./handlers.js";
import UI from "./ui.js";
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
// Normalize allowed users
// ----------------------------
let allowedUsers = [];
if (config.ALLOWED_USERS) {
  if (typeof config.ALLOWED_USERS === "string") {
    allowedUsers = config.ALLOWED_USERS.split(",").map(u => u.trim());
  } else if (Array.isArray(config.ALLOWED_USERS)) {
    allowedUsers = config.ALLOWED_USERS;
  } else {
    allowedUsers = [String(config.ALLOWED_USERS)];
  }
}

// ----------------------------
// /START COMMAND
// ----------------------------
bot.start(async (ctx) => {
  try {
    const chatId = String(ctx.chat.id);

    // Check authorization
    if (allowedUsers.length > 0 && !allowedUsers.includes(chatId)) {
      return ctx.reply("❌ You are not authorized to use this bot.");
    }

    // Send welcome message + inline menu
    await ctx.replyWithMarkdownV2(
      UI.startMessage(),
      UI.startKeyboard()
    );

    logInfo(`User ${ctx.from.username || ctx.from.id} started the bot`);
  } catch (err) {
    logError("Error in /start command", err);
    if (config.ADMIN_CHAT_ID) {
      await sendAdminNotification(bot, `❗ /start command error: ${err.message}`);
    }
  }
});

// ----------------------------
// Inline button handler (callback queries)
// ----------------------------
bot.on("callback_query", async (ctx) => {
  try {
    const data = ctx.callbackQuery.data;

    // Pass to TelegramHandlers
    new TelegramHandlers(bot).handleCallback(ctx);

    // Always answer callback to remove loading state
    await ctx.answerCbQuery();
  } catch (err) {
    logError("Error handling callback_query", err);
  }
});

// ----------------------------
// Global error handler
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
    // Attach custom handlers
    new TelegramHandlers(bot).init();

    // Launch bot
    await bot.launch();
    logInfo("🚀 Telegram bot launched successfully");

    // Notify admin
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
