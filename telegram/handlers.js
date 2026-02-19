import ui from "./ui.js";
import sender from "./sender.js";
import config from "../config/index.js";
import { logInfo, logError, logWarn } from "../utils/logs.js";
import presets from "../trader/presets.js";
import router from "../trader/router.js";
import { Markup } from "telegraf";
import { getState } from "../core/state.js";
import paperTrader from "../trader/paperTrader.js";

class TelegramHandlers {
  constructor(bot) {
    this.bot = bot;
    this.admins = [String(config.ADMIN_CHAT_ID)];
  }

  /* ===============================
      INIT HANDLERS
  =============================== */
  init() {
    this.bot.start((ctx) => this.start(ctx));
    this.bot.on("text", (ctx) => this.textHandler(ctx));
    this.bot.on("callback_query", (ctx) => this.handleCallback(ctx));
    this.handleAdminCommands(this.bot);
    logInfo("Telegram Handlers: READY");
  }

  /* ===============================
      SAFE SEND
  =============================== */
  async send(chatId, text, extra = {}) {
    try {
      await this.bot.telegram.sendMessage(chatId, text, {
        parse_mode: "MarkdownV2",
        ...extra,
      });
    } catch (err) {
      logError("Send Error", err);
    }
  }

  /* ===============================
      START
  =============================== */
  async start(ctx) {
    await this.send(ctx.chat.id, ui.startMessage(), ui.startKeyboard());
    logInfo(`User started bot: ${ctx.chat.id}`);
  }

  /* ===============================
      TEXT HANDLER
  =============================== */
  async textHandler(ctx) {
    const text = ctx.message.text.trim();
    const chatId = ctx.chat.id;

    if (text.startsWith("/")) return;
    if (text.startsWith("$")) {
      return this.handleWatch(chatId, text.substring(1));
    }

    await this.send(chatId, "❓ *Unknown message*\nSend `$TOKEN` to watch a pair.");
  }

  /* ===============================
      CALLBACK ROUTING
  =============================== */
  async handleCallback(ctx) {
    const chatId = ctx.chat?.id;
    const data = ctx.update?.callback_query?.data;
    if (!chatId || !data) return;

    if (!ctx.session) ctx.session = {};
    if (ctx.session.busy) return ctx.answerCbQuery("⏳ Please wait...");
    ctx.session.busy = true;
    setTimeout(() => (ctx.session.busy = false), 2500);

    try {
      await ctx.answerCbQuery("Processing...");

      const handlerMap = {
        // --- MAIN UI ---
        "ADMIN_DASHBOARD": () => this.send(chatId, "📊 *Dashboard*", ui.homeMenu()),
        "START_SCANNER": () => this.toggleScanner(chatId, true),
        "STOP_SCANNER": () => this.toggleScanner(chatId, false),
        "TRADING_MENU": () => this.send(chatId, "💹 *Trading Mode*", ui.tradingMenu()),
        "SETTINGS_MENU": () => this.send(chatId, "⚙️ *Settings*", ui.settingsMenu()),
        "VIEW_LOGS": () => this.send(chatId, "📨 *Fetching Logs...*\nComing soon..."),

        // --- TRADING ---
        "ENABLE_LIVE": () => this.setTradingMode(chatId, "live"),
        "ENABLE_PAPER": () => this.setTradingMode(chatId, "paper"),

        // --- SETTINGS ---
        "REFRESH_RPCS": () => this.send(chatId, "🔁 *Refreshing RPC endpoints...*"),
        "ANTI_RUG_SETTINGS": () => this.send(chatId, "🛡 *Anti-rug settings coming soon...*"),

        // --- SNIPER ---
        "OPEN_SNIPER": () => this.openSniper(chatId),
        "SNIPER_STATUS": () => this.send(chatId, "🎯 *Sniper Status*\nRunning: No\nLast trade: None\nErrors: 0"),

        // --- PNL / SIGNALS ---
        "PNL_MENU": () => this.send(chatId, "📈 *PNL Dashboard*\nStats loading soon..."),
        "SIGNALS_MENU": () => this.send(chatId, "📡 *Signals Panel*\nSignals will appear here"),
        "DEV_CHECK_MENU": () => this.send(chatId, "🧪 *Developer Diagnostics*\nComing soon..."),
      };

      // --- TOKEN ACTIONS ---
      if (data.startsWith("snipe_") || data.startsWith("BUY_")) {
        return this.handleBuy(chatId, data.replace(/^(snipe_|BUY_)/, ""));
      }

      if (data.startsWith("watch_") || data.startsWith("WATCH_")) {
        return this.handleWatch(chatId, data.replace(/^(watch_|WATCH_)/, ""));
      }

      if (data.startsWith("ignore_")) return this.send(chatId, "❌ Ignored.");

      if (data.startsWith("DETAILS_")) return this.handleDetails(chatId, data.replace("DETAILS_", ""));
      if (data.startsWith("SNIPER_PRESET_")) return this.sniperPreset(chatId, data.replace("SNIPER_PRESET_", ""));

      // --- ADMIN ---
      if (data.startsWith("ADMIN_")) return this.handleAdminCallback(ctx, data);

      // --- DEFAULT ---
      if (handlerMap[data]) return handlerMap[data]();

      logWarn(`Unknown callback: ${data}`);
      return this.send(chatId, `⚠️ Unknown action: \`${data}\``);

    } catch (err) {
      logError("Callback Error", err);
      return this.send(chatId, "❌ Internal error while processing action.");
    }
  }

  /* ===============================
      BUY / WATCH / DETAILS
  =============================== */
  async handleBuy(chatId, token) {
    try {
      await this.send(chatId, `🔫 *Sniping* \`${token}\``);
      const result = await router.executeSniper(token);
      await this.send(
        chatId,
        result?.success
          ? `✅ *Buy executed for* \`${token}\``
          : `❌ Failed to buy \`${token}\`\n${result?.error || "Unknown"}`
      );
    } catch (err) {
      logError("Buy Handler Error", err);
    }
  }

  async handleWatch(chatId, token) {
    await this.send(chatId, `👁 *Watching:* \`${token}\``);
  }

  async handleDetails(chatId, token) {
    await this.send(chatId, `📊 *Fetching details for:* \`${token}\``);
  }

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
      TRADING ACTIONS
  =============================== */
  async toggleScanner(chatId, enable) {
    const state = getState();
    state.scannerRunning = enable;
    await this.send(chatId, enable ? "🟢 *Scanner Started*" : "🔴 *Scanner Stopped*");
  }

  async setTradingMode(chatId, mode) {
    const state = getState();
    if (!["live","paper"].includes(mode)) return;
    state.tradingMode = mode;
    await this.send(chatId, mode === "live" ? "🟢 *Live trading enabled*" : "🧪 *Paper mode enabled*");
  }

  /* ===============================
      ADMIN CALLBACKS
  =============================== */
  async handleAdminCallback(ctx, data) {
    const chatId = ctx.chat.id;
    const state = getState();
    if (!this.admins.includes(String(ctx.from.id))) {
      return ctx.answerCbQuery("⛔ You are not an admin.");
    }

    switch(data) {
      case "ADMIN_HALT":
        state.tradingEnabled = false;
        await this.send(chatId, "⛔ *Trading halted*");
        break;
      case "ADMIN_RESUME":
        state.tradingEnabled = true;
        await this.send(chatId, "▶️ *Trading resumed*");
        break;
      case "ADMIN_PAUSE_SCAN":
        state.scannerRunning = false;
        await this.send(chatId, "⏸️ *Scan paused*");
        break;
      case "ADMIN_RESUME_SCAN":
        state.scannerRunning = true;
        await this.send(chatId, "▶️ *Scan resumed*");
        break;
      case "ADMIN_PAUSE_SIGNALS":
        state.signalingEnabled = false;
        await this.send(chatId, "⏸️ *Signals paused*");
        break;
      case "ADMIN_STATS":
        const stats = state.getStats();
        await this.send(chatId, `📊 *Stats*\nScanned: ${stats.scanned}\nSignaled: ${stats.signaled}\nSent: ${stats.sent}`);
        break;
      case "ADMIN_BROADCAST":
        await this.send(chatId, "📢 *Broadcasting...* (Coming soon)");
        break;
      case "ADMIN_RESTART":
        await this.send(chatId, "🔄 *Restarting bot...* (Requires manual restart)");
        break;
      case "ADMIN_USERS":
        await this.send(chatId, "👥 *User list*\nComing soon...");
        break;
      default:
        await this.send(chatId, `⚠️ Unknown admin action: \`${data}\``);
    }
  }

  /* ===============================
      ADMIN COMMAND REGISTRATION
  =============================== */
  handleAdminCommands(bot) {
    bot.command("admin", async (ctx) => {
      if (!this.admins.includes(String(ctx.from.id))) {
        return ctx.reply("⛔ You are not an admin.");
      }

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback("⛔ Halt Trading","ADMIN_HALT"), Markup.button.callback("▶️ Resume Trading","ADMIN_RESUME")],
        [Markup.button.callback("⏸️ Pause Scan","ADMIN_PAUSE_SCAN"), Markup.button.callback("▶️ Resume Scan","ADMIN_RESUME_SCAN")],
        [Markup.button.callback("⛔ Pause Signals","ADMIN_PAUSE_SIGNALS")],
        [Markup.button.callback("📊 Stats","ADMIN_STATS"), Markup.button.callback("📢 Broadcast","ADMIN_BROADCAST")],
        [Markup.button.callback("🔄 Restart Bot","ADMIN_RESTART"), Markup.button.callback("👥 User List","ADMIN_USERS")]
      ]);

      await ctx.reply("🛠 *Admin Panel*", { parse_mode: "Markdown", reply_markup: keyboard.reply_markup });
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
