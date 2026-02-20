import { Markup } from "telegraf";
import { escape } from "../utils/format.js";

const UI = {
  /* ============================
        SAFE MD ESCAPE
  ============================ */
  md(text = "") {
    try {
      return escape(String(text));
    } catch {
      return "InvalidText";
    }
  },

  num(n, decimals = 4) {
    const v = Number(n);
    if (isNaN(v)) return "0";
    return this.md(v.toFixed(decimals));
  },

  /* ============================
        START MESSAGE
  ============================ */
  startMessage() {
    return `
🤖 *Elite On\\-Chain Scanner*

AI\\-powered BSC intelligence engine built for speed and precision\\.

⚡ *Capabilities*
• Real\\-time pair detection  
• GeckoTerminal trending scanner  
• AI Risk & Anti\\-Rug scoring  
• Live & Paper Auto\\-Trading  
• Developer & Contract diagnostics  

Select an option below 👇
    `;
  },

  startKeyboard() {
    return Markup.inlineKeyboard([
      [Markup.button.callback("📊 Dashboard", "ADMIN_DASHBOARD")],
      [
        Markup.button.callback("🟢 Start Scanner", "START_SCANNER"),
        Markup.button.callback("🔴 Stop Scanner", "STOP_SCANNER"),
      ],
      [Markup.button.callback("💹 Trading Mode", "TRADING_MENU")],
      [Markup.button.callback("⚙️ Settings", "SETTINGS_MENU")],
      [Markup.button.callback("📨 Logs", "VIEW_LOGS")],
    ]);
  },

  /* ============================
        TOKEN SIGNAL BLOCK
  ============================ */
  tokenBlock(token = {}) {
    const name = this.md(token.name || "Unknown");
    const address = this.md(token.address || "N/A");
    const mc = this.num(token.mc ?? 0, 2);
    const lp = this.num(token.liquidity ?? 0, 2);
    const holders = this.md(token.holders ?? 0);
    const riskScore = Number(token.riskScore ?? 0);
    const confidence = this.md(token.confidence ?? 0);

    return [
      `🚀 *${name}*`,
      `\`${address}\``,
      ``,
      `💰 *MC:* ${mc}`,
      `💧 *LP:* ${lp}`,
      `👥 *Holders:* ${holders}`,
      `⚠️ *Risk:* ${this.riskColor(riskScore)} ${this.md(riskScore)}%`,
      `🎯 *Confidence:* ${confidence}%`,
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
  signalButtons(token = {}, chain = "bsc") {
    const address = token.address || "";
    const safeAddress = this.md(address);
    const url = `https://dexscreener.com/${chain}/${address}`;

    const btn = (text, cb) => Markup.button.callback(text, cb);

    return Markup.inlineKeyboard([
      [btn("🚀 Snipe Now", `snipe_${safeAddress}`)],
      [
        btn("💰 Take Profit", `takeprofit_${safeAddress}`),
        btn("🧨 Stop Loss", `stoploss_${safeAddress}`)
      ],
      [btn("🟡 Risk Analysis", `risk_${safeAddress}`)],
      [
        btn("👁 Watch", `watch_${safeAddress}`),
        btn("❌ Ignore", `ignore_${safeAddress}`)
      ],
      [{ text: "📈 Chart", url }],
      [btn("🔁 Refresh", `refresh_${safeAddress}`)],
    ]);
  },

  /* ============================
        TRADING MENU
  ============================ */
  tradingMenu() {
    return Markup.inlineKeyboard([
      [Markup.button.callback("🟢 Enable Live Mode", "ENABLE_LIVE")],
      [Markup.button.callback("🧪 Enable Paper Mode", "ENABLE_PAPER")],
      [Markup.button.callback("⬅️ Back", "ADMIN_DASHBOARD")],
    ]);
  },

  /* ============================
        SETTINGS MENU
  ============================ */
  settingsMenu() {
    return Markup.inlineKeyboard([
      [Markup.button.callback("🔁 Refresh RPCs", "REFRESH_RPCS")],
      [Markup.button.callback("🛡 Anti-Rug Settings", "ANTI_RUG_SETTINGS")],
      [Markup.button.callback("📡 Developer Check", "DEV_CHECK_MENU")],
      [Markup.button.callback("🧮 Contract Analyzer", "CONTRACT_ANALYZER")],
      [Markup.button.callback("⬅️ Back", "ADMIN_DASHBOARD")],
    ]);
  },

  /* ============================
        DASHBOARD MENU
  ============================ */
  homeMenu() {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback("⚙ Settings", "SETTINGS_MENU"),
        Markup.button.callback("📡 Sniper Status", "SNIPER_STATUS"),
      ],
      [Markup.button.callback("📈 PnL", "PNL_MENU")],
      [Markup.button.callback("🔍 Active Signals", "SIGNALS_MENU")],
    ]);
  },

  /* ============================
        PNL BLOCK
  ============================ */
  pnlBlock(pnl = {}) {
    const total = this.num(pnl.total ?? 0, 4);
    const wins = this.md(pnl.wins ?? 0);
    const losses = this.md(pnl.losses ?? 0);
    const recent = Array.isArray(pnl.recent) ? pnl.recent : [];

    const recentFormatted = recent.length
      ? recent.map(
          (t) =>
            `• ${this.md(t.token)} — ${this.num(t.profit ?? 0, 4)} BNB ${
              t.success ? "🟢" : "🔴"
            }`
        )
      : ["No recent trades"];

    return [
      `📈 *Performance Overview*`,
      ``,
      `💼 *Total PnL:* ${total} BNB`,
      `✅ *Wins:* ${wins}`,
      `❌ *Losses:* ${losses}`,
      ``,
      `🕒 *Recent Trades:*`,
      ...recentFormatted,
    ].join("\n");
  },

  /* ============================
        RISK ANALYSIS BLOCK
  ============================ */
  riskBlock(data = {}) {
    return [
      `🧠 *AI Risk Analysis*`,
      ``,
      `Owner Renounced: ${data.renounced ? "✅" : "❌"}`,
      `Liquidity Locked: ${data.liquidityLocked ? "✅" : "❌"}`,
      `Mint Function: ${data.mintable ? "⚠️ Yes" : "✅ No"}`,
      `Blacklist Function: ${data.blacklist ? "⚠️ Yes" : "✅ No"}`,
      ``,
      `Overall Score: ${this.riskColor(data.score)} ${this.md(data.score)}%`,
    ].join("\n");
  },

  /* ============================
        CONFIRM BUTTONS
  ============================ */
  confirmTrade(address) {
    return Markup.inlineKeyboard([
      [
        { text: "✅ Confirm Trade", callback_data: `confirm_${address}` }
      ],
      [
        { text: "❌ Cancel", callback_data: `cancel_${address}` }
      ]
    ]);
  }
};

export default UI;
