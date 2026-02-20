import ui from "./ui.js";
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
      INIT
  =============================== */
  init() {
    this.bot.start((ctx) => this.start(ctx));
    this.bot.on("text", (ctx) => this.textHandler(ctx));
    this.bot.on("callback_query", (ctx) => this.handleCallback(ctx));
    this.registerAdminCommand();
    logInfo("Telegram Handlers: READY");
  }

  /* ===============================
      SAFE SEND
  =============================== */
  async send(chatId, text, extra = {}) {
    try {
      await this.bot.telegram.sendMessage(chatId, text, {
        parse_mode: "Markdown",
        disable_web_page_preview: true,
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

    await this.send(chatId, "❓ Unknown message.\nSend `$TOKEN` to watch.");
  }

  /* ===============================
      CALLBACK ROUTING
  =============================== */
  async handleCallback(ctx) {
    const chatId = ctx.chat?.id;
    const data = ctx.update?.callback_query?.data;
    if (!chatId || !data) return;

    const state = getState();

    // Prevent spam clicking
    if (!ctx.session) ctx.session = {};
    if (ctx.session.busy) return ctx.answerCbQuery("⏳ Please wait...");
    ctx.session.busy = true;
    setTimeout(() => (ctx.session.busy = false), 2000);

    try {
      await ctx.answerCbQuery();

      // Block unauthorized admin actions
      if (/^ADMIN_/.test(data) && !this.admins.includes(String(ctx.from.id))) {
        return ctx.answerCbQuery("⛔ Not authorized");
      }

      /* ===== DIRECT HANDLER MAP FIRST ===== */
      const handlerMap = {
        "ADMIN_DASHBOARD": () => this.openAdminDashboard(chatId),

        "START_SCANNER": () => this.toggleScanner(chatId, true),
        "STOP_SCANNER": () => this.toggleScanner(chatId, false),

        "TRADING_MENU": () => this.send(chatId, "💹 Trading Mode", ui.tradingMenu()),
        "SETTINGS_MENU": () => this.send(chatId, "⚙️ Settings", ui.settingsMenu()),

        "ENABLE_LIVE": () => this.setTradingMode(chatId, "live"),
        "ENABLE_PAPER": () => this.setTradingMode(chatId, "paper"),

        "OPEN_SNIPER": () => this.openSniper(chatId),
        "SNIPER_STATUS": () => this.sniperStatus(chatId),

        "PNL_MENU": () => this.showPnl(chatId),
        "SIGNALS_MENU": () => this.showSignals(chatId),
      };

      if (handlerMap[data]) return handlerMap[data]();

      /* ===== TOKEN ACTIONS ===== */
      if (/^(BUY_|snipe_)/.test(data))
        return this.executeTrade(chatId, data.replace(/^(BUY_|snipe_)/, ""));

      if (/^(WATCH_|watch_)/.test(data))
        return this.handleWatch(chatId, data.replace(/^(WATCH_|watch_)/, ""));

      if (/^DETAILS_/.test(data))
        return this.handleDetails(chatId, data.replace("DETAILS_", ""));

      if (/^SNIPER_PRESET_/.test(data))
        return this.sniperPreset(chatId, data.replace("SNIPER_PRESET_", ""));

      /* ===== ADMIN ACTIONS ===== */
      if (/^ADMIN_/.test(data))
        return this.handleAdminAction(chatId, data);

      logWarn(`Unknown callback: ${data}`);
      await this.send(chatId, `⚠️ Unknown action: ${data}`);

    } catch (err) {
      logError("Callback Error", err);
      await this.send(chatId, "❌ Error processing action.");
    }
  }

  /* ===============================
      ADMIN DASHBOARD
  =============================== */
  async openAdminDashboard(chatId) {
    const state = getState();

    const text = `
🛠 *Admin Dashboard*

Scanner: ${state.scannerRunning ? "ON" : "OFF"}
Trading Mode: ${state.tradingMode}
Trading Enabled: ${state.tradingEnabled ? "YES" : "NO"}
Signals Enabled: ${state.signalingEnabled ? "YES" : "NO"}
`.trim();

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback("⛔ Halt Trading","ADMIN_HALT"),
        Markup.button.callback("▶️ Resume Trading","ADMIN_RESUME"),
      ],
      [
        Markup.button.callback("⏸️ Pause Scan","ADMIN_PAUSE_SCAN"),
        Markup.button.callback("▶️ Resume Scan","ADMIN_RESUME_SCAN"),
      ],
      [
        Markup.button.callback("📊 Stats","ADMIN_STATS"),
        Markup.button.callback("🔄 Restart","ADMIN_RESTART"),
      ]
    ]);

    return this.send(chatId, text, { reply_markup: keyboard.reply_markup });
  }

  /* ===============================
      ADMIN ACTIONS
  =============================== */
  async handleAdminAction(chatId, action) {
    const state = getState();

    switch (action) {
      case "ADMIN_HALT":
        state.tradingEnabled = false;
        return this.send(chatId, "⛔ Trading halted");

      case "ADMIN_RESUME":
        state.tradingEnabled = true;
        return this.send(chatId, "▶️ Trading resumed");

      case "ADMIN_PAUSE_SCAN":
        state.scannerRunning = false;
        return this.send(chatId, "⏸️ Scan paused");

      case "ADMIN_RESUME_SCAN":
        state.scannerRunning = true;
        return this.send(chatId, "▶️ Scan resumed");

      case "ADMIN_STATS":
        const stats = state.getStats();
        return this.send(
          chatId,
          `📊 Stats
Scanned: ${stats.scanned}
Signaled: ${stats.signaled}
Sent: ${stats.sent}
Buys: ${stats.buys}
Sells: ${stats.sells}
Errors: ${stats.errors}`
        );

      case "ADMIN_RESTART":
        return this.send(chatId, "🔄 Restart requires container restart.");

      default:
        return this.send(chatId, `⚠️ Unknown admin action: ${action}`);
    }
  }

  /* ===============================
      TRADE EXECUTION
  =============================== */
  async executeTrade(chatId, token) {
    const state = getState();

    await this.send(chatId, `🚀 Executing trade for ${token}`);

    try {
      if (state.tradingMode === "paper") {
        const trade = await paperTrader.buy(token, { usdAmount: 100 });
        return this.send(chatId, `🧪 Paper buy executed @ $${trade.priceUsd}`);
      }

      if (state.tradingMode === "live" && state.tradingEnabled) {
        const result = await router.executeSniper(token);
        return this.send(
          chatId,
          result?.success
            ? `✅ Live buy successful`
            : `❌ Live buy failed`
        );
      }

      return this.send(chatId, "⚠️ Trading disabled.");
    } catch (err) {
      logError("Trade error", err);
      return this.send(chatId, "❌ Trade failed.");
    }
  }

  /* ===============================
      WATCH
  =============================== */
  async handleWatch(chatId, token) {
    const state = getState();
    state.watchlist.add(token.toLowerCase());
    return this.send(chatId, `👁 Watching ${token}`);
  }

  async handleDetails(chatId, token) {
    return this.send(chatId, `📊 Fetching details for ${token}`);
  }

  async openSniper(chatId) {
    return this.send(chatId, ui.sniperMenu(), ui.sniperKeyboard());
  }

  async sniperPreset(chatId, presetId) {
    const preset = presets[presetId];
    if (!preset) return this.send(chatId, "❌ Invalid preset");

    return this.send(
      chatId,
      `🎯 Preset Loaded
Slippage: ${preset.slippage}
Gas: ${preset.gas}`
    );
  }

  async sniperStatus(chatId) {
    const state = getState();
    return this.send(
      chatId,
      `🎯 Sniper Status
Running: ${state.tradingEnabled ? "YES" : "NO"}
Mode: ${state.tradingMode}
Scanner: ${state.scannerRunning ? "ON" : "OFF"}`
    );
  }

  async toggleScanner(chatId, enable) {
    const state = getState();
    state.scannerRunning = enable;
    return this.send(chatId, enable ? "🟢 Scanner Started" : "🔴 Scanner Stopped");
  }

  async setTradingMode(chatId, mode) {
    const state = getState();
    state.tradingMode = mode;
    if (mode === "paper") state.paper.enabled = true;
    return this.send(chatId, mode === "live" ? "🟢 Live trading enabled" : "🧪 Paper mode enabled");
  }

  async showPnl(chatId) {
    const state = getState();
    const trades = state.paper.trades || [];
    const total = trades.reduce((sum, t) => sum + (t.pnlUsd || 0), 0);
    return this.send(chatId, `💰 Total PnL: $${total.toFixed(2)}`);
  }

  async showSignals(chatId) {
    const state = getState();
    const signals = state.getSignals();
    if (!signals?.length) return this.send(chatId, "📡 No active signals");

    for (const s of signals) {
      await this.send(chatId, `📢 Signal: ${s.token}`);
    }
  }

  registerAdminCommand() {
    this.bot.command("admin", async (ctx) => {
      if (!this.admins.includes(String(ctx.from.id))) {
        return ctx.reply("⛔ Not admin");
      }
      return this.openAdminDashboard(ctx.chat.id);
    });
  }
}

export default TelegramHandlers;
