import { Markup } from "telegraf";
import { escape } from "../utils/format.js";

const UI = {
  /* ============================
        SAFE ESCAPE
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
🤖 *Elite On-Chain Scanner*

AI-powered BSC intelligence engine.

⚡ *Capabilities*
• Real-time pair detection  
• AI Risk scoring  
• Paper & Live trading  
• Sniper execution engine  

Choose an option below 👇
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
      [Markup.button.callback("📡 Sniper Panel", "OPEN_SNIPER")],
      [Markup.button.callback("📈 PnL", "PNL_MENU")],
    ]);
  },

  /* ============================
        ADMIN DASHBOARD
  ============================ */
  adminDashboard(state = {}) {
    return `
🛠 *Admin Dashboard*

Scanner: ${state.scannerRunning ? "🟢 ON" : "🔴 OFF"}
Trading Mode: ${state.tradingMode}
Trading Enabled: ${state.tradingEnabled ? "YES" : "NO"}
Signals: ${state.signalingEnabled ? "ON" : "OFF"}
    `;
  },

  homeMenu() {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback("📡 Sniper Status", "SNIPER_STATUS"),
        Markup.button.callback("📈 PnL", "PNL_MENU"),
      ],
      [
        Markup.button.callback("💹 Trading Mode", "TRADING_MENU"),
        Markup.button.callback("⚙ Settings", "SETTINGS_MENU"),
      ],
    ]);
  },

  /* ============================
        TOKEN BLOCK
  ============================ */
  tokenBlock(token = {}) {
    const name = this.md(token.name || "Unknown");
    const address = this.md(token.address || "N/A");
    const mc = this.num(token.mc ?? 0, 2);
    const lp = this.num(token.liquidity ?? 0, 2);
    const holders = this.md(token.holders ?? 0);
    const riskScore = Number(token.riskScore ?? 0);
    const confidence = this.md(token.confidence ?? 0);

    return `
🚀 *${name}*
\`${address}\`

💰 MC: ${mc}
💧 LP: ${lp}
👥 Holders: ${holders}
⚠ Risk: ${this.riskColor(riskScore)} ${riskScore}%
🎯 Confidence: ${confidence}%
    `.trim();
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
    const url = `https://dexscreener.com/${chain}/${address}`;

    return Markup.inlineKeyboard([
      [Markup.button.callback("🚀 Snipe Now", `snipe_${address}`)],
      [
        Markup.button.callback("👁 Watch", `watch_${address}`),
        Markup.button.callback("📊 Details", `DETAILS_${address}`)
      ],
      [
        { text: "📈 Chart", url }
      ],
      [Markup.button.callback("🔁 Refresh", `refresh_${address}`)],
    ]);
  },

  /* ============================
        TRADING MENU
  ============================ */
  tradingMenu() {
    return Markup.inlineKeyboard([
      [Markup.button.callback("🟢 Enable Live Mode", "ENABLE_LIVE")],
      [Markup.button.callback("🧪 Enable Paper Mode", "ENABLE_PAPER")],
      [Markup.button.callback("⬅ Back", "ADMIN_DASHBOARD")],
    ]);
  },

  /* ============================
        SETTINGS MENU
  ============================ */
  settingsMenu() {
    return Markup.inlineKeyboard([
      [Markup.button.callback("🔁 Refresh RPCs", "REFRESH_RPCS")],
      [Markup.button.callback("🛡 Anti-Rug Settings", "ANTI_RUG_SETTINGS")],
      [Markup.button.callback("📡 Dev Check", "DEV_CHECK_MENU")],
      [Markup.button.callback("🧮 Contract Analyzer", "CONTRACT_ANALYZER")],
      [Markup.button.callback("⬅ Back", "ADMIN_DASHBOARD")],
    ]);
  },

  /* ============================
        SNIPER MENU
  ============================ */
  sniperMenu() {
    return `
🎯 *Sniper Control Panel*

Select preset or check status.
    `;
  },

  sniperKeyboard() {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback("⚡ Aggressive", "SNIPER_PRESET_AGGRESSIVE"),
        Markup.button.callback("🛡 Safe", "SNIPER_PRESET_SAFE"),
      ],
      [Markup.button.callback("📡 Status", "SNIPER_STATUS")],
      [Markup.button.callback("⬅ Back", "ADMIN_DASHBOARD")],
    ]);
  },

  /* ============================
        PNL BLOCK
  ============================ */
  pnlBlock(pnl = {}) {
    const total = this.num(pnl.total ?? 0, 4);
    const wins = this.md(pnl.wins ?? 0);
    const losses = this.md(pnl.losses ?? 0);

    return `
📈 *Performance Overview*

💼 Total PnL: ${total} BNB
✅ Wins: ${wins}
❌ Losses: ${losses}
    `.trim();
  },

  /* ============================
        RISK BLOCK
  ============================ */
  riskBlock(data = {}) {
    return `
🧠 *AI Risk Analysis*

Owner Renounced: ${data.renounced ? "✅" : "❌"}
Liquidity Locked: ${data.liquidityLocked ? "✅" : "❌"}
Mint Function: ${data.mintable ? "⚠ Yes" : "✅ No"}
Blacklist Function: ${data.blacklist ? "⚠ Yes" : "✅ No"}

Overall Score: ${this.riskColor(data.score)} ${data.score}%
    `.trim();
  },

  /* ============================
        CONFIRM TRADE
  ============================ */
  confirmTrade(address) {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback("✅ Confirm Trade", `confirm_${address}`),
        Markup.button.callback("❌ Cancel", `cancel_${address}`),
      ]
    ]);
  }
};

export default UI;
