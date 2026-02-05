/**
 * FILE: signals/generator.js
 *
 * Telegram-ready payload builder for memecoin signals
 * Fully MarkdownV2-safe
 * Inline buttons: Buy/Snipe, Watch, Details, Sell, Refresh
 * Returns { text, options, jsonPayload } for bots/snipers
 */

import { escapeMarkdownV2, formatUsd, formatPercent } from '../utils/format.js';
import config from '../config/index.js';
import pino from 'pino';

const log = pino({ level: config.LOG_LEVEL || 'info' });

// --- Risk emoji helper ---
function riskEmoji(level) {
  switch ((level || '').toUpperCase()) {
    case 'LOW': return '🟢';
    case 'MEDIUM': return '🟡';
    case 'HIGH': return '🔴';
    default: return '⚪';
  }
}

// --- Build Telegram inline keyboard ---
function buildInlineKeyboard(signal) {
  const id = signal.id;
  return {
    inline_keyboard: [
      [{ text: '🔫 SNIPER (Buy)', callback_data: `snipe:${id}` }],
      [
        { text: '👁️ Watch', callback_data: `watch:${id}` },
        { text: 'ℹ️ Details', callback_data: `details:${id}` }
      ],
      [
        { text: '💸 Sell', callback_data: `sell:${id}` },
        { text: '♻️ Refresh', callback_data: `refresh:${id}` }
      ]
    ]
  };
}

/**
 * buildTelegramMessage
 * @param {object} signal - output from analyzeToken
 * @returns {object} { text, options, jsonPayload }
 */
export function buildTelegramMessage(signal) {
  if (!signal) return null;

  const dex = signal.details?.dex ?? {};
  const rec = signal.details?.recommended ?? {};

  const name = escapeMarkdownV2(dex.name || dex.tokenName || 'Unknown');
  const symbol = escapeMarkdownV2(dex.symbol || '');
  const address = escapeMarkdownV2(signal.token || '');
  const pairUrl = signal.details?.dexSummary?.pairUrl || '';
  const score = signal.score ?? 0;
  const risk = (signal.riskLevel || 'HIGH').toUpperCase();
  const emoji = riskEmoji(risk);
  const flags = (signal.flags || []).map(f => escapeMarkdownV2(String(f))).join(', ') || 'None';

  const liquidityUSD = Number(dex.liquidityUSD ?? dex.liquidity ?? 0);
  const volume24 = Number(dex.volume24h ?? 0);
  const holders = dex.holders ?? 'N/A';
  const fdv = Number(dex.fdv ?? 0);
  const ownerPct = dex.ownerPct ?? null;

  // --- Build message text ---
  const lines = [
    `${emoji} *${name}* (${symbol})`,
    `Address: \`${address}\``,
    pairUrl ? `Chart: ${escapeMarkdownV2(pairUrl)}` : '',
    '',
    `*Score:* ${score}/100  •  *Risk:* ${risk}`,
    `*Liquidity:* ${formatUsd(liquidityUSD)}  •  *24h Vol:* ${formatUsd(volume24)}`,
    `*Holders:* ${holders}  •  *FDV:* ${formatUsd(fdv)}`,
    ownerPct !== null ? `*Owner %:* ${formatPercent(ownerPct)}` : '',
    `*Flags:* ${flags}`,
    '',
    `*Recommendation:* ${
      risk === 'LOW'
        ? 'Eligible for sniper / consider small position'
        : risk === 'MEDIUM'
        ? 'Caution — reduce position'
        : 'Avoid — high risk'
    }`,
    `*Rec Buy %:* ${rec.recommendedBuyPercent ?? 0}%  •  *Min Buy USD:* $${rec.minBuyUsd ?? 1}`,
  ].filter(Boolean);

  const text = lines.join('\n').slice(0, 3900); // Telegram limit safety
  const reply_markup = buildInlineKeyboard(signal);

  const jsonPayload = {
    id: signal.id,
    token: signal.token,
    score,
    riskLevel: risk,
    flags: signal.flags,
    recommended: rec,
    dexSummary: signal.details?.dexSummary ?? {},
    liquidityUSD,
    volume24,
    holders,
    fdv,
    ownerPct,
  };

  const options = {
    parse_mode: 'MarkdownV2',
    disable_web_page_preview: false,
    reply_markup,
  };

  if (config.LOG_LEVEL === 'debug') {
    log.debug({ id: signal.id, token: signal.token, score }, 'Built Telegram message');
  }

  return { text, options, jsonPayload };
}

export default { buildTelegramMessage };

/**
 * processSignalCandidate
 * Accepts token object from scanner, normalizes, and feeds processor
 */
import { processSignal } from "./processor.js";

export function processSignalCandidate(tokenData) {
  if (!tokenData?.address) return;

  processSignal({
    source: "scanner",
    token: tokenData.address,
    meta: tokenData, // preserve full object for analytics
    timestamp: Date.now()
  });
    }
