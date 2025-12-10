// FILE: telegram/handlers.js
import ui from "./ui.js";
import sender from "./sender.js";
import config from "../config/index.js";
import { logInfo, logError, logWarn } from "../utils/logs.js";
import presets from "../trader/presets.js";
import router from "../trader/router.js";
import { Markup } from "telegraf";

class TelegramHandlers {
  constructor(bot) {
    this.bot = bot;
  }

  /* ===============================
      INIT
  =============================== */
  init() {
    // Start + text
    this.bot.start((ctx) => this.start(ctx));
    this.bot.on("text", (ctx) => this.textHandler(ctx));

    // 🔥 THE FIX: enable button callbacks
    this.bot.on("callback_query", (ctx) => this.handleCallback(ctx));

    // Admin commands
    this.handleAdminCommands(this.bot);

    logInfo("Telegram Handlers: READY");
  }

  /* ===============================
      SAFE SEND WRAPPER
  =============================== */
  async send(chatId, text, extra = {}) {
    try {
      await this.bot.telegram.sendMessage(chatId, text, {
        parse_mode: "MarkdownV2",
        ...extra,
      });
    } catch (e) {
      logError("Send Error", e);
    }
  }

  /* ===============================
      START COMMAND
  =============================== */
  async start(ctx) {
    try {
      await this.send(ctx.chat.id, ui.startMessage(), ui.startKeyboard());
      logInfo(`User Started Bot: ${ctx.chat.id}`);
    } catch (e) {
      logError("Start Handler Error", e);
    }
  }

  /* ===============================
      CALLBACK HANDLER
  =============================== */
  async handleCallback(ctx) {
    const chatId = ctx.chat?.id;
    const data = ctx.update?.callback_query?.data;

    if (!chatId || !data) return;

    logInfo(`Callback => ${data}`);

    // Instant button feedback
    try {
      await ctx.answerCbQuery("Processing...");
    } catch {}

    // Prevent spam tapping
    if (!ctx.session) ctx.session = {};
    if (ctx.session.busy) {
      return ctx.answerCbQuery("⏳ Please wait...");
    }
    ctx.session.busy = true;
    setTimeout(() => (ctx.session.busy = false), 2500);

    try {
      /* ============================
          MAIN UI BUTTONS
      ============================ */

      if (data === "ADMIN_DASHBOARD")
        return this.send(chatId, "📊 *Dashboard*", ui.homeMenu());

      if (data === "START_SCANNER")
        return this.send(chatId, "🟢 *Scanner Started*");

      if (data === "STOP_SCANNER")
        return this.send(chatId, "🔴 *Scanner Stopped*");

      if (data === "TRADING_MENU")
        return this.send(chatId, "💹 *Trading Mode*", ui.tradingMenu());

      if (data === "SETTINGS_MENU")
        return this.send(chatId, "⚙️ *Settings*", ui.settingsMenu());

      if (data === "VIEW_LOGS")
        return this.send(chatId, "📨 *Fetching Logs...*\n(Coming soon)");

      /* ============================
          TRADING MODE
      ============================ */
      if (data === "ENABLE_LIVE")
        return this.send(chatId, "🟢 *Live trading enabled*");

      if (data === "ENABLE_PAPER")
        return this.send(chatId, "🧪 *Paper Mode enabled*");

      /* ============================
          SETTINGS
      ============================ */
      if (data === "REFRESH_RPCS")
        return this.send(chatId, "🔁 *Refreshing RPC endpoints...*");

      if (data === "ANTI_RUG_SETTINGS")
        return this.send(chatId, "🛡 *Anti-Rug settings coming soon*");

      /* ============================
          TOKEN ACTIONS
      ============================ */
      if (data.startsWith("snipe_"))
        return this.handleBuy(chatId, data.replace("snipe_", ""));

      if (data.startsWith("watch_"))
        return this.handleWatch(chatId, data.replace("watch_", ""));

      if (data.startsWith("ignore_"))
        return this.send(chatId, "❌ Ignored.");

      /* ============================
          OLD COMPATIBILITY
      ============================ */
      if (data.startsWith("BUY_"))
        return this.handleBuy(chatId, data.slice(4));

      if (data.startsWith("WATCH_"))
        return this.handleWatch(chatId, data.slice(6));

      if (data.startsWith("DETAILS_"))
        return this.handleDetails(chatId, data.slice(8));

      if (data === "OPEN_SNIPER")
        return this.openSniper(chatId);

      if (data.startsWith("SNIPER_PRESET_"))
        return this.sniperPreset(chatId, data.replace("SNIPER_PRESET_", ""));

      /* ============================
          UNKNOWN
      ============================ */
      logWarn(`Unknown callback: ${data}`);
      return this.send(chatId, `⚠️ Unknown action: \`${data}\``);

    } catch (err) {
      logError("Callback Error", err);
      return this.send(chatId, "❌ *Internal error while processing action.*");
    }
  }

  /* ===============================
      TEXT HANDLER
  =============================== */
  async textHandler(ctx) {
    const chatId = ctx.chat.id;
    const text = ctx.message.text.trim();

    if (text.startsWith("/")) return;

    if (text.startsWith("$")) {
      const symbol = text.substring(1);
      return this.handleWatch(chatId, symbol);
    }

    return this.send(
      chatId,
      "❓ *Unknown message*\nSend `$TOKEN` to watch a pair."
    );
  }

  /* ===============================
      BUY HANDLER
  =============================== */
  async handleBuy(chatId, pair) {
    try {
      await this.send(chatId, `🔫 *Sniping* \`${pair}\``);

      const result = await router.executeSniper(pair);

      await this.send(
        chatId,
        result?.success
          ? `✅ *Buy executed for* \`${pair}\``
          : `❌ Failed to buy \`${pair}\`\n${result?.error || "Unknown error"}`
      );
    } catch (e) {
      logError("Buy Handler Error", e);
    }
  }

  /* ===============================
      WATCH HANDLER
  =============================== */
  async handleWatch(chatId, symbol) {
    try {
      await this.send(chatId, `👁 *Watching:* \`${symbol}\``);
    } catch (e) {
      logError("Watch Error", e);
    }
  }

  /* ===============================
      DETAILS
  =============================== */
  async handleDetails(chatId, pair) {
    await this.send(chatId, `📊 *Fetching details for:* \`${pair}\``);
  }

  /* ===============================
      SNIPER UI
  =============================== */
  async openSniper(chatId) {
    return this.send(chatId, ui.sniperMenu(), ui.sniperKeyboard());
  }

  async sniperPreset(chatId, presetId) {
    const preset = presets[presetId];

    if (!preset) return this.send(chatId, "❌ Invalid preset");

    return this.send(
      chatId,
      `🎯 *Preset Loaded:* ${presetId}\nSlippage: ${preset.slippage}\nGas: ${preset.gas}`
    );
  }

  /* ===============================
      ADMIN COMMANDS
  =============================== */
  handleAdminCommands(bot) {
    bot.command("admin", async (ctx) => {
      if (String(ctx.from.id) !== String(config.ADMIN_CHAT_ID))
        return ctx.reply("⛔ You are not an admin.");

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback("📢 Broadcast", "ADMIN_BROADCAST")],
        [Markup.button.callback("📊 Stats", "ADMIN_STATS")],
        [Markup.button.callback("🔄 Restart Bot", "ADMIN_RESTART")],
        [Markup.button.callback("👥 User List", "ADMIN_USERS")],
      ]);

      await ctx.reply("🛠 *Admin Panel*", {
        parse_mode: "Markdown",
        reply_markup: keyboard.reply_markup,
      });
    });
  }
}

/* ===============================
    GLOBAL ERROR CATCHER
=============================== */
process.on("unhandledRejection", (reason) => {
  logError("Unhandled Promise Rejection:", reason);
});

export default TelegramHandlers;
