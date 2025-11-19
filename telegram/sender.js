// FILE: telegram/sender.js
import { Markup } from "telegraf";
import fs from "fs";
import config from "../config/index.js";
import { logInfo, logError } from "../utils/logs.js";
import { escapeMarkdownV2 } from "../utils/format.js";

// ----------------------
// INTERNAL STATE
// ----------------------
let adminNotifier = null;

// Register a notifier callback (to avoid circular imports)
function registerAdminNotifier(fn) {
  adminNotifier = fn;
}

// ----------------------
// SEEN PAIRS STORAGE
// ----------------------
const SEEN_FILE = "./seen_pairs.json";
let seenPairs = new Set();

// Load seen pairs
try {
  if (fs.existsSync(SEEN_FILE)) {
    const fileData = JSON.parse(fs.readFileSync(SEEN_FILE, "utf8"));
    seenPairs = new Set(fileData);
  }
} catch (err) {
  logError("Failed to load seen pairs file", err);
}

// Save seen pairs
function saveSeen() {
  try {
    fs.writeFileSync(SEEN_FILE, JSON.stringify([...seenPairs], null, 2));
  } catch (err) {
    logError("Failed to write seen pairs file", err);
  }
}

// Check if pair already sent
function isPairSent(address) {
  return seenPairs.has(address.toLowerCase());
}

// Mark pair as sent
function markPairAsSent(address) {
  const key = address.toLowerCase();
  if (!seenPairs.has(key)) {
    seenPairs.add(key);
    saveSeen();
  }
}

// ----------------------
// BUILD SIGNAL MESSAGE
// ----------------------
function buildSignalMessage(signal) {
  return `
*NEW TOKEN DETECTED – HYPER BEAST MODE*
━━━━━━━━━━━━━━
🏷️ *Name:* ${escapeMarkdownV2(signal.token)} (${escapeMarkdownV2(signal.symbol)})
💠 *Address:* \`${escapeMarkdownV2(signal.address)}\`
💵 *Price:* $${signal.price?.toFixed(4) || "0.0000"}
🌊 *Liquidity:* $${signal.liquidity?.usd?.toLocaleString() || "0"}
📊 *Volume (24h):* $${signal.volume?.h24?.toLocaleString() || "0"}
⏱️ *Age:* ${signal.age || "Unknown"}
🔗 *Chart:* [View Chart](${signal.pairUrl || "https://example.com"})
🛡️ *Risk Level:* ${signal.riskLevel || "HIGH"}
💯 *Signal Strength:* STRONG
━━━━━━━━━━━━━━
*Holders:* ${signal.holders?.toLocaleString() || "N/A"}
*FDV:* $${signal.fdv?.toLocaleString() || "0"}
*Owner %:* ${signal.ownerPct || "N/A"}
*Flags:* ${signal.flags?.map(escapeMarkdownV2).join(", ") || "None"}
`;
}

// ----------------------
// SEND SIGNAL
// ----------------------
async function sendTokenSignal(bot, chatId, signal) {
  try {
    if (isPairSent(signal.address)) {
      logInfo(`Signal already sent: ${signal.symbol} (${signal.address})`);
      return;
    }

    const message = buildSignalMessage(signal);

    const buttons = Markup.inlineKeyboard([
      [
        Markup.button.callback("💥 Snipe Now", `SNIPER_${signal.tokenAddress}`),
        Markup.button.callback("👀 Watch", `WATCH_${signal.tokenAddress}`)
      ],
      [Markup.button.callback("ℹ Details", `DETAILS_${signal.tokenAddress}`)]
    ]);

    await bot.telegram.sendMessage(chatId, message, {
      parse_mode: "MarkdownV2",
      ...buttons
    });

    markPairAsSent(signal.address);
    logInfo(`Signal delivered: ${signal.symbol} (${signal.address})`);
  } catch (err) {
    logError("Failed to send token signal", err);
    if (adminNotifier) {
      adminNotifier(`❗ *Signal Error*\n${escapeMarkdownV2(err.message)}`);
    }
  }
}

// ----------------------
// ADMIN NOTIFICATIONS
// ----------------------
async function sendAdminNotification(bot, message) {
  if (!config.ADMIN_CHAT_ID) return;

  try {
    await bot.telegram.sendMessage(config.ADMIN_CHAT_ID, escapeMarkdownV2(message), {
      parse_mode: "MarkdownV2"
    });
    logInfo("Admin notification sent");
  } catch (err) {
    logError("Failed to send admin message", err);
  }
}

// ----------------------
// EXPORT DEFAULT OBJECT
// ----------------------
export default {
  sendTokenSignal,
  sendAdminNotification,
  registerAdminNotifier,
  isPairSent,
  markPairAsSent
};
