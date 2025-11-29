// FILE: telegram/bot.js
import { Telegraf } from "telegraf";
import config from "../config/index.js";
import { logInfo, logError } from "../utils/logs.js";
import TelegramHandlers from "./handlers.js";
import UI from "./ui.js";
import { sendAdminNotification } from "./sender.js";

// --------------------------------------
// LOAD TOKEN SAFELY
// --------------------------------------
const TELEGRAM_TOKEN =
  config.TELEGRAM_BOT_TOKEN ||
  config.BOT_TOKEN ||
  process.env.TELEGRAM_BOT_TOKEN ||
  process.env.BOT_TOKEN;

if (!TELEGRAM_TOKEN) {
  throw new Error("❌ TELEGRAM_BOT_TOKEN missing");
}

// --------------------------------------
// CREATE BOT
// --------------------------------------
const bot = new Telegraf(TELEGRAM_TOKEN, {
  handlerTimeout: 60_000
});

// --------------------------------------
// REGISTER HANDLERS (ONLY ONCE!)
// --------------------------------------
const handlers = new TelegramHandlers(bot);
handlers.init();

// --------------------------------------
// FIXED /start COMMAND (NO DUPLICATE)
// --------------------------------------
bot.start(async (ctx) => {
  try {
    await ctx.replyWithMarkdownV2(UI.startMessage(), {
      reply_markup: UI.startKeyboard().reply_markup
    });

    logInfo(`User started bot: ${ctx.chat.id}`);
  } catch (err) {
    logError("Start command error", err);
    if (config.ADMIN_CHAT_ID) {
      await sendAdminNotification(bot, `❗ /start error: ${err.message}`);
    }
  }
});

// --------------------------------------
// SINGLE CALLBACK HANDLER
// --------------------------------------
bot.on("callback_query", async (ctx) => {
  try {
    // forward to the unified handler
    await handlers.handleCallback(ctx);
  } catch (err) {
    logError("Callback error", err);
  }

  try { await ctx.answerCbQuery(); } catch {}
});

// --------------------------------------
// GLOBAL ERROR HANDLER
// --------------------------------------
bot.catch(async (err, ctx) => {
  logError("Bot Error", err);

  try {
    await ctx.reply("⚠️ Unexpected bot error. Admin notified.");
  } catch {}

  try {
    if (config.ADMIN_CHAT_ID) {
      await sendAdminNotification(bot, `❗ Bot Error\n${err.message}`);
    }
  } catch {}
});

// --------------------------------------
// LAUNCH FUNCTION
// --------------------------------------
export async function startTelegramBot() {
  try {
    await bot.launch();
    logInfo("🚀 Bot launched");

    if (config.ADMIN_CHAT_ID) {
      await sendAdminNotification(bot, "🤖 Bot started successfully");
    }

    // graceful shutdown
    process.once("SIGINT", () => bot.stop("SIGINT"));
    process.once("SIGTERM", () => bot.stop("SIGTERM"));

  } catch (err) {
    logError("❌ Failed to start bot", err);

    if (config.ADMIN_CHAT_ID) {
      await sendAdminNotification(bot, `❗ Startup Error: ${err.message}`);
    }
  }
}

export default bot;
