import { Markup } from "telegraf";
import fs from "fs/promises";
import path from "path";
import config from "../config/index.js";
import { logInfo, logError } from "../utils/logs.js";
import { escapeMarkdownV2 } from "../utils/format.js";

/* ======================================================
   ADMIN NOTIFIER REGISTRY
====================================================== */
let adminNotifier = null;
export function registerAdminNotifier(fn) {
  adminNotifier = fn;
}

/* ======================================================
   SEEN PAIRS (TTL + ASYNC PERSISTENCE)
====================================================== */
const SEEN_FILE = path.resolve(process.cwd(), "seen_pairs.json");
const SEEN_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours

let seenPairs = new Map();
let persistScheduled = false;

/* ---------- LOAD ---------- */
(async function loadSeen() {
  try {
    const raw = await fs.readFile(SEEN_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      parsed.forEach(({ key, ts }) => {
        if (Date.now() - ts < SEEN_TTL_MS) {
          seenPairs.set(key, ts);
        }
      });
    }
  } catch {
    logInfo("No existing seen_pairs.json found");
  }
})();

/* ---------- SAVE (BUFFERED) ---------- */
function schedulePersist() {
  if (persistScheduled) return;
  persistScheduled = true;

  setTimeout(async () => {
    try {
      const data = [...seenPairs.entries()].map(([key, ts]) => ({ key, ts }));
      await fs.writeFile(SEEN_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
      logError("Failed to persist seen pairs", err);
    } finally {
      persistScheduled = false;
    }
  }, 1000);
}

function pairKey(address, chain = "bsc") {
  return `${chain}:${address}`.toLowerCase();
}

export function isPairSent(address, chain) {
  return seenPairs.has(pairKey(address, chain));
}

export function markPairAsSent(address, chain) {
  const key = pairKey(address, chain);
  seenPairs.set(key, Date.now());
  schedulePersist();
}

/* ======================================================
   UNIVERSAL SAFE SENDER
====================================================== */
export async function send(bot, chatId, payload = {}) {
  try {
    const text = escapeMarkdownV2(payload.text || "");
    const options = payload.options || {};

    return await bot.telegram.sendMessage(chatId, text, {
      parse_mode: "MarkdownV2",
      disable_web_page_preview: true,
      ...options,
    });
  } catch (err) {
    logError("Telegram send failed", err);
    adminNotifier?.(`Telegram send error: ${err.message}`);
  }
}

/* ======================================================
   SIGNAL MESSAGE BUILDER
====================================================== */
export function buildSignalMessage(signal) {
  const num = (n, d = 6) =>
    typeof n === "number" ? n.toFixed(d) : "0.000000";

  return `
🚨 *NEW TOKEN SIGNAL*
━━━━━━━━━━━━━━
🏷 *Name:* ${escapeMarkdownV2(signal.token)} (${escapeMarkdownV2(signal.symbol)})
💠 *Address:* \`${signal.address}\`
💵 *Price:* $${num(signal.price)}
🌊 *Liquidity:* $${signal.liquidity?.usd?.toLocaleString() || "0"}
📊 *Volume 24h:* $${signal.volume?.h24?.toLocaleString() || "0"}
⏱ *Age:* ${escapeMarkdownV2(signal.age || "Unknown")}
🛡 *Risk:* ${escapeMarkdownV2(signal.riskLevel || "UNKNOWN")}
━━━━━━━━━━━━━━
👥 *Holders:* ${signal.holders || "N/A"}
💰 *FDV:* $${signal.fdv?.toLocaleString() || "0"}
🚩 *Flags:* ${
    signal.flags?.length
      ? signal.flags.map(escapeMarkdownV2).join(", ")
      : "None"
  }
`.trim();
}

/* ======================================================
   SEND TOKEN SIGNAL (IDEMPOTENT)
====================================================== */
export async function sendTokenSignal(bot, chatId, signal) {
  try {
    if (!signal?.address) return;
    if (isPairSent(signal.address, signal.chain)) return;

    const message = buildSignalMessage(signal);

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback("🚀 Snipe", `BUY_${signal.address}`),
        Markup.button.callback("👁 Watch", `WATCH_${signal.address}`),
      ],
      [
        Markup.button.url(
          "📈 Chart",
          signal.pairUrl || "https://dexscreener.com"
        ),
      ],
    ]);

    await bot.telegram.sendMessage(chatId, message, {
      parse_mode: "MarkdownV2",
      disable_web_page_preview: true,
      reply_markup: keyboard.reply_markup,
    });

    markPairAsSent(signal.address, signal.chain);
    logInfo(`Signal sent: ${signal.symbol}`);
  } catch (err) {
    logError("sendTokenSignal failed", err);
    adminNotifier?.(`Signal send error: ${err.message}`);
  }
}

/* ======================================================
   ADMIN NOTIFICATION
====================================================== */
export async function sendAdminNotification(bot, message) {
  if (!config.ADMIN_CHAT_ID) return;
  try {
    await bot.telegram.sendMessage(
      config.ADMIN_CHAT_ID,
      escapeMarkdownV2(message),
      { parse_mode: "MarkdownV2" }
    );
  } catch (err) {
    logError("Admin notify failed", err);
  }
}

/* ======================================================
   FALLBACK NOTIFIER
====================================================== */
export async function notifyTelegram(bot, chatId, text) {
  return send(bot, chatId, { text });
         }
