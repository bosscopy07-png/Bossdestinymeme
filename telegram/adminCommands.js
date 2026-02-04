import {
  disableTrading,
  enableTrading,
  getTradingStatus
} from "../core/tradingGuard.js";
import { escapeMarkdownV2 } from "../utils/format.js";

export function registerAdminCommands(bot, adminId) {
  // Ensure ID is a string for comparison
  const ADMIN_ID = adminId.toString();

  bot.command("halt", (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    disableTrading("Telegram admin command");
    ctx.reply("⛔ Trading halted");
  });

  bot.command("resume", (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    enableTrading();
    ctx.reply("▶️ Trading resumed");
  });

  bot.command("status", (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    const status = getTradingStatus();
    ctx.reply(
      `📊 Trading Status\n` +
      `Enabled: ${status.tradingEnabled}\n` +
      `Daily Loss: $${status.dailyLoss}\n` +
      `Max Daily Loss: $${status.maxDailyLoss}\n` +
      `Max Trade: $${status.maxTradeUsd}`
    );
  });
      }
