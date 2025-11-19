// FILE: telegram/sender.js
import { Markup } from "telegraf";
import { logInfo, logError } from "../utils/logs.js";
import config from "../config/index.js";
import fs from "fs";
import path from "path";

// ----------------------
// INTERNAL STATE
// ----------------------
let adminNotifier = null;

// SAFELY REGISTER ADMIN NOTIFIER (prevents circular imports)
export function registerAdminNotifier(fn) {
  adminNotifier = fn;
}

// ----------------------
// SEEN PAIRS FILE STORAGE
// ----------------------
const SEEN_FILE = path.resolve("./seen_pairs.json");
let seenPairs = new Set();

// Load storage
try {
  if (fs.existsSync(SEEN_FILE)) {
    const fileData = JSON.parse(fs.readFileSync(SEEN_FILE, "utf8"));
    seenPairs = new Set(fileData);
  }
} catch (err) {
  logError("Failed to load seen pairs file", err);
}

// Save storage
function saveSeen() {
  try {
    fs.writeFileSync(SEEN_FILE, JSON.stringify([...seenPairs], null, 2));
  } catch (err) {
    logError("Failed to write seen pairs file", err);
  }
}

// Check if token already sent
export function isPairSent(address) {
  return seenPairs.has(address.toLowerCase());
}

// Mark token as sent
export function markPairAsSent(address) {
  const key = address.toLowerCase();
  if (!seenPairs.has(key)) {
    seenPairs.add(key);
    saveSeen();
  }
}

// ----------------------
// MARKDOWN SANITIZER
// ----------------------
function sanitize(text = "") {
  // Escape MarkdownV2 special characters for Telegram
  return String(text).replace(/([_*[\]()~`>#+\-=|{}.!])/g, "\\$1");
}

// ----------------------
// MAIN SIGNAL BUILDER
// ----------------------
function buildSignalMessage(data) {
  const {
    symbol,
    name,
    address,
    priceUsd,
    mc,
    liquidity,
    buys,
    sells,
    pairCreatedAt,
  } = data;

  return (
    `*${sanitize(symbol)} — ${sanitize(name)}*\n` +
    `\`${sanitize(address)}\`\n\n` +
    `💰 *Price:* $${sanitize(priceUsd)}\n` +
    `📦 *Market Cap:* ${sanitize(mc)}\n` +
    `💧 *Liquidity:* ${sanitize(liquidity)}\n` +
    `🟢 Buys: ${sanitize(String(buys || 0))} | 🔴 Sells: ${sanitize(String(sells || 0))}\n` +
    `⏱️ *Pair Age:* ${sanitize(pairCreatedAt || "Unknown")}\n`
  );
}

// ----------------------
// MAIN SENDER
// ----------------------
export async function sendTokenSignal(bot, chatId, tokenData) {
  try {
    const message = buildSignalMessage(tokenData);
    const address = tokenData.address;

    const buttons = Markup.inlineKeyboard([
      [
        Markup.button.callback("💥 Snipe Now", `SNIPER_${address}`),
        Markup.button.callback("👀 Watch", `WATCH_${address}`),
      ],
      [Markup.button.callback("ℹ Details", `DETAILS_${address}`)],
    ]);

    await bot.telegram.sendMessage(chatId, message, {
      parse_mode: "MarkdownV2",
      ...buttons,
    });

    markPairAsSent(address);
    logInfo(`Signal delivered: ${tokenData.symbol} (${address})`);
  } catch (err) {
    logError("Failed to send token signal", err);

    if (adminNotifier) {
      adminNotifier(`❗ *Signal Error*\n${sanitize(err.message)}`);
    }
  }
}

// ----------------------
// ADMIN NOTIFICATION
// ----------------------
export async function sendAdminNotification(bot, message) {
  if (!config.ADMIN_CHAT_ID) return;

  try {
    await bot.telegram.sendMessage(config.ADMIN_CHAT_ID, sanitize(message), {
      parse_mode: "MarkdownV2",
    });

    logInfo("Admin notification sent");
  } catch (err) {
    logError("Failed to send admin message", err);
  }
}
