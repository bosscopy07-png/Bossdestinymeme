// FILE: telegram/ui.js
import { Markup } from "telegraf";
import { escape } from "../utils/format.js";

const UI = {

  md(text = "") {
    try { return escape(String(text)); }
    catch { return "InvalidText"; }
  },

  /* ============================
        START MESSAGE
  ============================ */
  startMessage() {
    return `
🤖 *Welcome to Elite On\\-Chain Scanner Bot*

Your AI\\-powered BSC memecoin detector, sniper engine, and auto\\-trade assistant\\.

⚡ *Features:*
• Real\\-time new pair detection\\.
• GeckoTerminal trending scanner\\.
• Mempool early detection & AI Anti\\-Rug\\.
• Auto\\-Snipe / Auto\\-Sell \\(Live or Paper\\)\\.
• Developer check & Contract audit tools\\.

Tap a button below to begin 👇
    `;
  },

  startKeyboard() {
    return Markup.inlineKeyboard([
      [ Markup.button.callback("📊 Dashboard", "ADMIN_DASHBOARD") ],
      [
        Markup.button.callback("🟢 Start Scanner", "START_SCANNER"),
        Markup.button.callback("🔴 Stop Scanner", "STOP_SCANNER")
      ],
      [ Markup.button.callback("💹 Trading Mode", "TRADING_MENU") ],
      [ Markup.button.callback("⚙️ Settings", "SETTINGS_MENU") ],
      [ Markup.button.callback("📨 Logs", "VIEW_LOGS") ]
    ]);
  },

  /* ============================
      TOKEN SIGNAL BLOCK
  ============================ */
  tokenBlock(token = {}) {
    const name = this.md(token.name || "Unknown");
    const address = this.md(token.address || "N/A");
    const mc = this.md(token.mc ?? "0");
    const lp = this.md(token.liquidity ?? "0");
    const holders = this.md(token.holders ?? "0");
    const riskScore = Number(token.riskScore ?? 0);
    const confidence = this.md(token.confidence ?? 0);

    return [
      `*${name}*`,
      `\`${address}\``,
      ``,
      `*MC:* ${mc}`,
      `*LP:* ${lp}`,
      `*Holders:* ${holders}`,
      `*Risk:* ${this.riskColor(riskScore)} ${riskScore}%`,
      `*Confidence:* ${confidence}%`
    ].join("\n");
  },

  riskColor(score = 0) {
    if (score < 30) return "🟢";
    if (score < 60) return "🟡";
    return "🔴";
  },

  /* ============================
      SIGNAL BUTTONS (IMPROVED)
  ============================ */
  signalButtons(token = {}) {
    const address = token.address || "";

    return {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🚀 Snipe Now", callback_data: `SNIPE_${address}` }],
          [{ text: "💰 Take Profit", callback_data: `TAKEPROFIT_${address}` }],
          [{ text: "🧨 Stop Loss", callback_data: `STOPLOSS_${address}` }],
          [{ text: "🟡 Risk Analysis", callback_data: `RISK_${address}` }],
          [{ text: "👁 Watch", callback_data: `WATCH_${address}` }],
          [{ text: "❌ Ignore", callback_data: `IGNORE_${address}` }],
          [{ text: "📈 Chart", url: `https://dexscreener.com/bsc/${address}` }],
          [{ text: "🔁 Refresh", callback_data: `REFRESH_${address}` }]
        ]
      }
    };
  },

  /* ============================
        TRADING MENU
  ============================ */
  tradingMenu() {
    return Markup.inlineKeyboard([
      [ Markup.button.callback("🟢 Enable Live Mode", "ENABLE_LIVE") ],
      [ Markup.button.callback("🧪 Enable Paper Mode", "ENABLE_PAPER") ],
      [ Markup.button.callback("⬅️ Back", "ADMIN_DASHBOARD") ]
    ]);
  },

  /* ============================
        SETTINGS MENU
  ============================ */
  settingsMenu() {
    return Markup.inlineKeyboard([
      [ Markup.button.callback("🔁 Refresh RPCs", "REFRESH_RPCS") ],
      [ Markup.button.callback("🛡 Anti-Rug Settings", "ANTI_RUG_SETTINGS") ],
      [ Markup.button.callback("📡 Developer Check", "DEV_CHECK_MENU") ],
      [ Markup.button.callback("🧮 Contract Analyzer", "CONTRACT_ANALYZER") ],
      [ Markup.button.callback("⬅️ Back", "ADMIN_DASHBOARD") ]
    ]);
  },

  /* ============================
        DASHBOARD MENU (FIXED)
  ============================ */
  homeMenu() {
    return {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "⚙ Settings", callback_data: "SETTINGS_MENU" },
            { text: "📡 Sniper Status", callback_data: "SNIPER_STATUS" }
          ],
          [{ text: "📈 PnL", callback_data: "PNL_MENU" }],
          [{ text: "🔍 Active Signals", callback_data: "SIGNALS_MENU" }]
        ]
      }
    };
  },

  /* ============================
        PNL BLOCK
  ============================ */
  pnlBlock(pnl = {}) {
    const total = Number(pnl.total ?? 0).toFixed(4);
    const wins = pnl.wins ?? 0;
    const losses = pnl.losses ?? 0;
    const recent = Array.isArray(pnl.recent) ? pnl.recent : [];

    return [
      `*Total PnL:* ${this.md(total)} BNB`,
      `*Wins:* ${this.md(wins)}`,
      `*Losses:* ${this.md(losses)}`,
      ``,
      `*Recent Trades:*`,
      ...recent.map(t =>
        `• ${this.md(t.token)} — ${this.md(Number(t.profit ?? 0).toFixed(4))} BNB (${t.success ? "🟢" : "🔴"})`
      )
    ].join("\n");
  },

  /* ============================
        CONFIRM BUTTONS
  ============================ */
  confirmButtons(text = "Confirm", cancelText = "Cancel") {
    return {
      reply_markup: {
        inline_keyboard: [
          [{ text, callback_data: "CONFIRM" }],
          [{ text: cancelText, callback_data: "CANCEL" }]
        ]
      }
    };
  }

};

export default UI;
