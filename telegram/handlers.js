// FILE: telegram/handlers.js
import ui from './ui.js';
import sender from './sender.js';
import config from '../config/index.js';
import { logInfo, logError, logWarn } from '../utils/logs.js';
import presets from '../trader/presets.js';
import router from '../trader/router.js';
import { Markup } from 'telegraf';

class TelegramHandlers {
  constructor(bot) {
    this.bot = bot;
  }

  init() {
    this.bot.start((ctx) => this.start(ctx));
    this.bot.on('text', (ctx) => this.textHandler(ctx));
    this.bot.on('callback_query', (ctx) => this.callback(ctx));
    this.handleAdminCommands(this.bot);

    logInfo("Telegram Handlers: READY");
  }

  // Unified send wrapper
  async send(chatId, text, extra = {}) {
    try {
      await this.bot.telegram.sendMessage(chatId, text, {
        parse_mode: "MarkdownV2",
        ...extra
      });
    } catch (e) {
      logError("Send Error", e);
    }
  }

  async start(ctx) {
    try {
      await this.send(ctx.chat.id, ui.startMessage(), ui.startKeyboard());
      logInfo(`User Started Bot: ${ctx.chat.id}`);
    } catch (e) {
      logError("Start Handler Error", e);
    }
  }

  async callback(ctx) {
    const chatId = ctx.chat?.id;
    const data = ctx.update?.callback_query?.data;
    if (!chatId || !data) return;

    try {
      if (data.startsWith("BUY_")) {
        await this.handleBuy(chatId, data.slice(4));

      } else if (data.startsWith("WATCH_")) {
        await this.handleWatch(chatId, data.slice(6));

      } else if (data.startsWith("DETAILS_")) {
        await this.handleDetails(chatId, data.slice(8));

      } else if (data === "OPEN_SNIPER") {
        await this.openSniper(chatId);

      } else if (data.startsWith("SNIPER_PRESET_")) {
        await this.sniperPreset(chatId, data.replace("SNIPER_PRESET_", ""));

      } else {
        logWarn("Unknown callback: " + data);
      }

    } catch (e) {
      logError("Callback Error", e);
    }

    try { await ctx.answerCbQuery(); } catch {}
  }

  async textHandler(ctx) {
    const chatId = ctx.chat.id;
    const text = ctx.message.text.trim();

    if (text.startsWith("/")) return;

    if (text.startsWith("$")) {
      const symbol = text.slice(1).trim();
      return this.handleWatch(chatId, symbol);
    }

    return this.send(
      chatId,
      "❓ *I don't understand this message.*\nSend *$TOKEN* to watch a coin."
    );
  }

  async handleBuy(chatId, pair) {
    try {
      await this.send(chatId, `🔫 *Sniping:* ${pair}\n_Executing sniper order..._`);

      const result = await router.executeSniper(pair);

      await this.send(
        chatId,
        result?.success
          ? `✅ *Buy executed for ${pair}*`
          : `❌ Failed to buy ${pair}\n${result?.error || "Unknown error"}`
      );

      logInfo(`Buy executed for ${pair} (${result?.success})`);
    } catch (e) {
      logError("Buy Handler Error", e);
    }
  }

  async handleWatch(chatId, symbol) {
    try {
      await this.send(chatId, `👀 *Watching:* ${symbol}\nYou'll get alerts.`);
      logInfo(`Watching ${symbol}`);
    } catch (e) {
      logError("Watch Error", e);
    }
  }

  async handleDetails(chatId, pair) {
    await this.send(chatId, `🧾 *Fetching details for:* ${pair}`);
    await this.send(chatId, `📊 *Token Details Coming Soon*\n(${pair})`);
  }

  async openSniper(chatId) {
    await this.send(chatId, ui.sniperMenu(), ui.sniperKeyboard());
  }

  async sniperPreset(chatId, presetId) {
    const preset = presets[presetId];
    if (!preset)
      return this.send(chatId, "❌ Invalid preset selected.");

    await this.send(
      chatId,
      `🎯 *Preset Loaded:* ${presetId}\nSlippage: ${preset.slippage}\nGas: ${preset.gas}`
    );
  }

  handleAdminCommands(bot) {
    bot.command("admin", async (ctx) => {
      const userId = String(ctx.from.id);
      if (userId !== String(config.ADMIN_CHAT_ID))
        return ctx.reply("⛔ You are not an admin.");

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback("📢 Broadcast", "ADMIN_BROADCAST")],
        [Markup.button.callback("📊 Stats", "ADMIN_STATS")],
        [Markup.button.callback("🔄 Restart Bot", "ADMIN_RESTART")],
        [Markup.button.callback("👥 User List", "ADMIN_USERS")]
      ]);

      await ctx.reply("🛠 *Admin Panel*\nChoose an option:", {
        parse_mode: "Markdown",
        reply_markup: keyboard.reply_markup
      });
    });
  }
}

export default TelegramHandlers;
