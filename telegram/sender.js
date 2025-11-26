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

function registerAdminNotifier(fn) {
  adminNotifier = fn;
}

// ----------------------
// SEEN PAIRS STORAGE
// ----------------------
const SEEN_FILE = "./seen_pairs.json";
let seenPairs = new Set();

try {
  if (fs.existsSync(SEEN_FILE)) {
    const fileData = JSON.parse(fs.readFileSync(SEEN_FILE, "utf8"));
    seenPairs = new Set(fileData);
  }
} catch (err) {
  logError("Failed to load seen pairs file", err);
}

function saveSeen() {
  try {
    fs.writeFileSync(SEEN_FILE, JSON.stringify([...seenPairs], null, 2));
  } catch (err) {
    logError("Failed to write seen pairs file", err);
  }
}

function isPairSent(address) {
  return seenPairs.has(address.toLowerCase());
}

function markPairAsSent(address) {
  const key = address.toLowerCase();
  if (!seenPairs.has(key)) {
    seenPairs.add(key);
    saveSeen();
  }
}

// ----------------------
// UNIVERSAL SENDER
// ----------------------
async function send(chatId, payload = {}) {
  try {
    const text = payload.text || "";
    const options = payload.options || {};

    return await global.bot.telegram.sendMessage(chatId, escapeMarkdownV2(text), {
      parse_mode: "MarkdownV2",
      ...options
    });
  } catch (err) {
    logError("Sender.send() failed", err);
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
🔗 *Chart:* [View Chart](${signal.pairUrl || "https://dexscreener.com"})
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
        Markup.button.callback("💥 Snipe Now", `BUY_${signal.address}`),
        Markup.button.callback("👀 Watch", `WATCH_${signal.address}`)
      ],
      [Markup.button.callback("ℹ Details", `DETAILS_${signal.address}`)]
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
// ADMIN NOTIFICATION
// ----------------------
export async function sendAdminNotification(bot, message) {
  if (!config.ADMIN_CHAT_ID) return;

  try {
    await bot.telegram.sendMessage(
      config.ADMIN_CHAT_ID,
      escapeMarkdownV2(message),
      { parse_mode: "MarkdownV2" }
    );
    logInfo("Admin notification sent");
  } catch (err) {
    logError("Failed to send admin message", err);
  }
}

// ----------------------
// EXPORTS
// ----------------------
export default {
  send,
  sendTokenSignal,
  sendAdminNotification,
  registerAdminNotifier,
  isPairSent,
  markPairAsSent
};
