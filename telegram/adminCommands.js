import { disableTrading, enableTrading, getTradingStatus } from "../core/tradingGuard.js";
import { escapeMarkdownV2 } from "../utils/format.js";
import { getState } from "../core/state.js";

/**
 * Register admin-only Telegram commands
 */
export function registerAdminCommands(bot) {
  const admins = (process.env.ADMIN_ID || "").split(",").map((id) => id.trim());

  function isAdmin(id) {
    return admins.includes(String(id));
  }

  // ----- Trading commands -----
  bot.command("halt", (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    disableTrading("Telegram admin command");
    ctx.reply("⛔ Trading halted");
  });

  bot.command("resume", (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    enableTrading();
    ctx.reply("▶️ Trading resumed");
  });

  bot.command("trading_status", (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const status = getTradingStatus();
    ctx.reply(
      `📊 Trading Status\n` +
      `Enabled: ${status.tradingEnabled}\n` +
      `Daily Loss: $${status.dailyLoss}\n` +
      `Max Daily Loss: $${status.maxDailyLoss}\n` +
      `Max Trade: $${status.maxTradeUsd}`
    );
  });

  // ----- Scanner / signal commands -----
  bot.command("pause_scan", (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    getState().control.scanning = false;
    ctx.reply("⏸️ Scanning paused");
  });

  bot.command("resume_scan", (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    getState().control.scanning = true;
    ctx.reply("▶️ Scanning resumed");
  });

  bot.command("pause_signals", (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    getState().control.signaling = false;
    ctx.reply("⛔ Signals paused");
  });

  bot.command("resume_signals", (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    getState().control.signaling = true;
    ctx.reply("▶️ Signals resumed");
  });

  // ----- Stats / status commands -----
  bot.command("stats", (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const s = getState();
    ctx.reply(
      `📊 Stats\n` +
      `Scanned: ${s.stats.scanned}\n` +
      `Signals: ${s.stats.signaled}\n` +
      `Sent: ${s.stats.sent}\n` +
      `RPC: ${s.rpc.active || "N/A"}`
    );
  });

  bot.command("system_status", (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const c = getState().control;
    ctx.reply(
      `⚙️ System Status\n` +
      `Scanning: ${c.scanning}\n` +
      `Signaling: ${c.signaling}\n` +
      `Trading: ${c.trading}`
    );
  });
                 }
