// telegram/ui.js
// Production‑ready Telegram UI module with enhanced safety and flexibility (ESM)

import { escape } from "../utils/format.js";

export const UI = {
  /**
   * Escape MarkdownV2 sensitive content safely
   */
  md(text = "") {
    try {
      return escape(String(text));
    } catch (e) {
      console.warn("UI.md failed to escape text:", e?.message);
      return "InvalidText";
    }
  },

  /**
   * Build token info block for signal messages
   */
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

  /**
   * Risk color emoji helper
   */
  riskColor(score = 0) {
    if (score < 30) return "🟢";
    if (score < 60) return "🟡";
    return "🔴";
  },

  /**
   * Inline buttons for a new token signal
   */
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

  /**
   * Build user settings menu
   */
  settingsMenu(profile = {}) {
    return {
      parse_mode: "MarkdownV2",
      reply_markup: {
        inline_keyboard: [
          [
            { text: `Gas: ${profile.maxGas ?? "N/A"}`, callback_data: "edit_gas" },
            { text: `Slip: ${profile.maxSlippage ?? "N/A"}%`, callback_data: "edit_slip" }
          ],
          [{ text: `Spend: ${profile.spendLimit ?? "0"} BNB`, callback_data: "edit_spend" }],
          [{ text: `Mode: ${profile.mode ?? "paper"}`, callback_data: "edit_mode" }],
          [{ text: profile.sniperEnabled ? "🟢 Sniper ON" : "🔴 Sniper OFF", callback_data: "toggle_sniper" }],
          [{ text: "📜 Watchlist", callback_data: "open_watchlist" }],
          [{ text: "⬅ Back", callback_data: "home" }]
        ]
      }
    };
  },

  /**
   * Home menu
   */
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

  /**
   * Build PnL list message text
   */
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
      `*Recent Trades:*`
    ]
      .concat(
        recent.map(
          (t) => `• ${this.md(t.token)} — ${this.md(Number(t.profit ?? 0).toFixed(4))} BNB (${t.success ? "🟢" : "🔴"})`
        )
      )
      .join("\n");
  },

  /**
   * Generic confirmation buttons
   */
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
