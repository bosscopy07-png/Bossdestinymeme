import { Markup } from "telegraf";
import fs from "fs";
import path from "path";
import config from "../config/index.js";
import { logInfo, logError } from "../utils/logs.js";
import { escapeMarkdownV2 } from "../utils/format.js";

// ----------------------
// INTERNAL STATE
// ----------------------
let adminNotifier = null;
export function registerAdminNotifier(fn) {
  adminNotifier = fn;
}

// ----------------------
// SEEN PAIRS STORAGE
// ----------------------
const SEEN_FILE = path.resolve(process.cwd(), "seen_pairs.json");
let seenPairs = new Set();

try {
  if (fs.existsSync(SEEN_FILE)) {
    const fileData = JSON.parse(fs.readFileSync(SEEN_FILE, "utf8"));
    if (Array.isArray(fileData)) {
      seenPairs = new Set(fileData.map(a => a.toLowerCase()));
    }
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

export function isPairSent(address) {
  return seenPairs.has(address.toLowerCase());
}

export function markPairAsSent(address) {
  const key = address.toLowerCase();
  if (!seenPairs.has(key)) {
    seenPairs.add(key);
    saveSeen();
  }
}

// ----------------------
// UNIVERSAL SENDER
// ----------------------
export async function send(bot, chatId, payload = {}) {
  try {
    const text = payload.text || "";
    const options = payload.options || {};

    return await bot.telegram.sendMessage(
      chatId,
      escapeMarkdownV2(text),
      {
        parse_mode: "MarkdownV2",
        disable_web_page_preview: true,
        ...options
      }
    );
  } catch (err) {
    logError("Sender.send() failed", err);
    if (adminNotifier) {
      adminNotifier(`Sender Error: ${err.message}`);
    }
  }
}

// ----------------------
// BUILD SIGNAL MESSAGE
// ----------------------
export function buildSignalMessage(signal) {
  return `
*🚨 NEW TOKEN DETECTED*
━━━━━━━━━━━━━━
🏷️ *Name:* ${escapeMarkdownV2(signal.token)} (${escapeMarkdownV2(signal.symbol)})
💠 *Address:* \`${signal.address}\`
💵 *Price:* $${signal.price?.toFixed(6) ?? "0.000000"}
🌊 *Liquidity:* $${signal.liquidity?.usd?.toLocaleString() ?? "0"}
📊 *Volume (24h):* $${signal.volume?.h24?.toLocaleString() ?? "0"}
⏱️ *Age:* ${escapeMarkdownV2(signal.age ?? "Unknown")}
🛡️ *Risk:* ${escapeMarkdownV2(signal.riskLevel ?? "HIGH")}
━━━━━━━━━━━━━━
👥 *Holders:* ${signal.holders?.toLocaleString() ?? "N/A"}
💰 *FDV:* $${signal.fdv?.toLocaleString() ?? "0"}
🚩 *Flags:* ${signal.flags?.length ? signal.flags.map(escapeMarkdownV2).join(", ") : "None"}
`.trim();
}

// ----------------------
// SEND SIGNAL
// ----------------------
export async function sendTokenSignal(bot, chatId, signal) {
  try {
    if (!signal?.address) return;

    if (isPairSent(signal.address)) {
      logInfo(`Signal already sent: ${signal.symbol}`);
      return;
    }

    const message = buildSignalMessage(signal);

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback("💥 Snipe", `BUY_${signal.address}`),
        Markup.button.callback("👀 Watch", `WATCH_${signal.address}`)
      ],
      [
        Markup.button.url(
          "📈 Chart",
          signal.pairUrl || "https://dexscreener.com"
        )
      ]
    ]);

    await bot.telegram.sendMessage(chatId, message, {
      parse_mode: "MarkdownV2",
      disable_web_page_preview: true,
      reply_markup: keyboard.reply_markup
    });

    markPairAsSent(signal.address);
    logInfo(`Signal delivered: ${signal.symbol}`);
  } catch (err) {
    logError("Failed to send token signal", err);
    if (adminNotifier) {
      adminNotifier(`Signal Error: ${err.message}`);
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
// FALLBACK SIMPLE NOTIFIER
// ----------------------
export async function notifyTelegram(bot, chatId, text) {
  try {
    await send(bot, chatId, { text });
  } catch (err) {
    logError("notifyTelegram failed", err);
  }
}
