// FILE: signals/generator.js (COMMONJS)

/**
 * signals/generator.js
 *
 * Builds Telegram-ready payloads (MarkdownV2 escaped), inline keyboard,
 * and structured JSON payloads for sniper/trader systems.
 */

const { 
  escapeMarkdownV2, 
  formatNumber, 
  formatUsd, 
  formatPercent 
} = require('../utils/format');

const config = require('../config');
const Pino = require('pino');

const log = Pino({ level: config.LOG_LEVEL || 'info' });

// Inline keyboard builder (CommonJS)
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
 * buildTelegramMessage(signal)
 */
function buildTelegramMessage(signal) {
  const dex = signal.details?.dex ?? {};
  const rec = signal.details?.recommended ?? {};

  const name = escapeMarkdownV2(dex.name || dex.tokenName || 'Unknown');
  const symbol = escapeMarkdownV2(dex.symbol || '');
  const address = escapeMarkdownV2(signal.token);

  const pairUrl = signal.details?.dexSummary?.pairUrl ?? '';

  const score = signal.score ?? 0;
  const risk = signal.riskLevel ?? 'HIGH';
  const flags = (signal.flags || []).map(escapeMarkdownV2).join(', ') || 'None';

  const liquidityUSD = Number(dex.liquidityUSD ?? dex.liquidity ?? 0);
  const volume24 = Number(dex.volume24h ?? 0);

  const lines = [];
  lines.push(`*${name}* \\(${symbol}\\)`);
  lines.push(`Address: \`${address}\``);
  if (pairUrl) lines.push(`Chart: ${escapeMarkdownV2(pairUrl)}`);
  lines.push('');
  lines.push(`*Score:* ${score}/100  •  *Risk:* ${risk}`);
  lines.push(`*Liquidity:* ${formatUsd(liquidityUSD)}  •  *24h Vol:* ${formatUsd(volume24)}`);
  lines.push(`*Holders:* ${dex.holders ?? 'N/A'}  •  *FDV:* ${formatUsd(dex.fdv ?? 0)}`);
  lines.push(`*Flags:* ${flags}`);
  lines.push('');
  lines.push(
    `*Recommendation:* ${
      risk === 'LOW'
        ? 'Eligible for sniper / consider small position'
        : risk === 'MEDIUM'
        ? 'Caution — reduce position'
        : 'Avoid — high risk'
    }`
  );
  lines.push(
    `*Rec Buy %:* ${rec.recommendedBuyPercent ?? 0}%  •  *Min Buy USD:* $${rec.minBuyUsd ?? 1}`
  );

  const text = lines.join('\n');

  const reply_markup = buildInlineKeyboard(signal);

  const jsonPayload = {
    id: signal.id,
    token: signal.token,
    score: signal.score,
    risk: signal.riskLevel,
    flags: signal.flags,
    recommend: rec,
    dexSummary: signal.details?.dexSummary ?? {}
  };

  const options = {
    parse_mode: 'MarkdownV2',
    disable_web_page_preview: false,
    reply_markup
  };

  log.debug(
    { id: signal.id, token: signal.token, score: signal.score },
    'Built Telegram message'
  );

  return { text, options, jsonPayload };
}

module.exports = {
  buildTelegramMessage
};
