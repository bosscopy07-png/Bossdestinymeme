const { getBot } = require('./bot');
const { usd } = require('../utils/format');

/**
 * Send a signal to Telegram chat
 * @param {string|number} chatId
 * @param {object} payload
 */
async function sendSignalToChat(chatId, payload) {
  const bot = getBot();
  if (!bot) throw new Error('Telegram bot not initialized');

  const msg = `<b>${payload.scoreLabel} ${payload.tokenName} (${payload.tokenSymbol})</b>\n` +
    `Pair: <code>${payload.pair}</code>\n` +
    `Liquidity: ${usd(payload.liquidity)}\nPrice: $${payload.price}\nScore: ${payload.scoreLabel} (${payload.scoreValue})\n` +
    `${payload.honeypot ? '⚠️ Honeypot detected' : '✅ Safe'}`;

  try {
    await bot.telegram.sendMessage(chatId, msg, { parse_mode: 'HTML' });
  } catch (err) {
    console.error('❌ sendSignalToChat failed:', err.description || err.message);
  }
}

module.exports = { sendSignalToChat };
