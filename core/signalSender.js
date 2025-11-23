// FILE: core/signalSender.js
import { bot } from '../telegram/bot.js';
import pino from 'pino';

const logger = pino({
  name: 'SignalSender',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Sends a new token signal to a Telegram channel
 * @param {Object} signal - Token signal data
 */
export async function pushSignal(signal) {
  if (!signal || !signal.address) {
    logger.warn('Invalid signal provided', { signal });
    return;
  }

  const msg = `
🚀 *NEW TOKEN DETECTED – HYPER BEAST MODE*
━━━━━━━━━━━━━━
🏷️ *Name:* ${signal.token} (${signal.symbol})
💠 *Address:* \`${signal.address}\`
💵 *Price:* $${signal.price}
🌊 *Liquidity:* $${signal.liquidity}
📊 *Volume (24h):* $${signal.volume}
⏱️ *Age:* ${signal.age}
🔗 *Chart:* [View Chart](${signal.url})
━━━━━━━━━━━━━━
🔥 *Signal Strength: STRONG*
`;

  try {
    const chatId = process.env.TG_CHANNEL;
    if (!chatId) {
      logger.error('TG_CHANNEL environment variable not set');
      return;
    }

    await bot.telegram.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    logger.info(`Signal sent for ${signal.token} (${signal.symbol})`);
  } catch (error) {
    logger.error({ error }, 'Failed to send signal to Telegram');
  }
}
