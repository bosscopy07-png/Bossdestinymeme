// FILE: telegram/ui.js
import { Markup } from "telegraf";
import { escape } from "../utils/format.js";

const UI = {

  md(text = "") {
    try { return escape(String(text)); }
    catch { return "InvalidText"; }
  },

  startMessage() {
    // All special MarkdownV2 characters escaped: \- \. \( \)
    const msg = `
🤖 *Welcome to Elite On\\-Chain Scanner Bot*

Your AI\\-powered BSC memecoin detector, sniper engine, and automated trading assistant\\.

⚡ *Features:*
• Real\\-time new pair detection\\.
• Gecko Terminal trending scanner\\.
• Mempool early detection & AI Anti\\-Rug\\.
• Auto\\-Snipe / Auto\\-Sell \\(Live or Paper\\)\\.
• Admin dashboard & full scanner controls\\.

Tap a button below to get started 👇
    `;
    return msg;
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
      SIGNAL BUTTONS
  ============================ */
  signalButtons(token = {}) {
    const address = token.address || "";
    return {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🚀 Snipe Now", callback_data: `snipe_${address}` }],
          [{ text: "👁 Watch", callback_data: `watch_${address}` }],
          [{ text: "❌ Ignore", callback_data: `ignore_${address}` }],
          [{ text: "📊 Chart", url: `https://dexscreener.com/bsc/${address}` }]
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
      [ Markup.button.callback("⬅️ Back", "ADMIN_DASHBOARD") ]
    ]);
  },

  /* ============================
      HOME / DASHBOARD MENU
  ============================ */
  homeMenu() {
    return {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "⚙ Settings", callback_data: "settings" },
            { text: "📡 Sniper Status", callback_data: "sniper_status" }
          ],
          [{ text: "📈 PnL", callback_data: "pnl" }],
          [{ text: "🔍 Active Signals", callback_data: "signals" }]
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
          [{ text, callback_data: "confirm" }],
          [{ text: cancelText, callback_data: "cancel" }]
        ]
      }
    };
  }

};

export default UI;
