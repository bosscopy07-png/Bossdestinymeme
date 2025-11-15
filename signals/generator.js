// FILE: signals/generator.js
/**
 * ESM version
 * Builds Telegram-ready payloads (MarkdownV2 escaped), inline keyboard objects,
 * and programmatic JSON payloads for bots/snipers.
 */

import { escapeMarkdownV2, formatNumber, formatUsd, formatPercent } from '../utils/format.js';
import config from '../config/index.js';
import pino from 'pino';

const log = pino({ level: config.LOG_LEVEL || 'info' });

// Build inline keyboard
function buildInlineKeyboard(signal) {
  const id = signal.id;

  const buttons = [
    [{ text: '🔫 SNIPER (Buy)', callback_data: `snipe:${id}` }],
    [
      { text: '👁️ Watch', callback_data: `watch:${id}` },
      { text: 'ℹ️ Details', callback_data: `details:${id}` }
    ],
    [
      { text: '💸 Sell', callback_data: `sell:${id}` },
      { text: '♻️ Refresh', callback_data: `refresh:${id}` }
    ],
  ];

  return { inline_keyboard: buttons };
}

/**
 * buildTelegramMessage(signal)
 * Clean, strict ESM version.
 */
export function buildTelegramMessage(signal) {
  const dex = signal.details?.dex ?? {};
  const rec = signal.details?.recommended ?? {};

  const name = escapeMarkdownV2(dex.name || dex.tokenName || 'Unknown');
  const symbol = escapeMarkdownV2(dex.symbol || '');
  const address = escapeMarkdownV2(signal.token);
  const pairUrl = signal.details?.dexSummary?.pairUrl ?? '';
  const score = signal.score ?? 0;
  const risk = signal.riskLevel ?? 'HIGH';
  const flags = (signal.flags || []).map(escapeMarkdownV2).join(', ') || 'None';

  const liquidityUSD = Number(
    signal.details?.dex?.liquidityUSD ??
    signal.details?.dex?.liquidity ??
    0
  );

  const volume24 = Number(signal.details?.dex?.volume24h ?? 0);

  // Message text
  const lines = [
    `*${name}* (${symbol})`,
    `Address: \`${address}\``,
    pairUrl ? `Chart: ${escapeMarkdownV2(pairUrl)}` : '',
    '',
    `*Score:* ${score}/100  •  *Risk:* ${risk}`,
    `*Liquidity:* ${formatUsd(liquidityUSD)}  •  *24h Vol:* ${formatUsd(volume24)}`,
    `*Holders:* ${signal.details?.dex?.holders ?? 'N/A'}  •  *FDV:* ${formatUsd(signal.details?.dex?.fdv ?? 0)}`,
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
  ];

  const text = lines.join('\n');

  const reply_markup = buildInlineKeyboard(signal);

  // JSON payload for bots/snipers
  const jsonPayload = {
    id: signal.id,
    token: signal.token,
    score: signal.score,
    risk: signal.riskLevel,
    flags: signal.flags,
    recommend: rec,
    dexSummary: signal.details?.dexSummary ?? {},
  };

  const options = {
    parse_mode: 'MarkdownV2',
    disable_web_page_preview: false,
    reply_markup,
  };

  log.debug(
    { id: signal.id, token: signal.token, score: signal.score },
    'Built Telegram message'
  );

  return { text, options, jsonPayload };
}

export default {
  buildTelegramMessage,
};
