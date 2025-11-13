const { Telegraf } = require('telegraf');
const { registerHandlers } = require('./handlers');

let botInstance = null;

/**
 * Initialize Telegram bot
 * @param {string} botToken
 * @returns {Promise<Telegraf>}
 */
async function initBot(botToken) {
  if (!botToken) throw new Error('❌ TELEGRAM_BOT_TOKEN is required');
  if (botInstance) return botInstance; // avoid multiple instances

  botInstance = new Telegraf(botToken);

  // Register inline handlers
  registerHandlers(botInstance);

  // Start command
  botInstance.start(ctx => ctx.reply('🤖 Memecoin Scanner PRO connected and ready ✅'));

  try {
    await botInstance.launch();
    console.log('✅ Telegram bot launched in polling mode');
  } catch (err) {
    console.error('❌ Telegram launch failed:', err.description || err.message);
    throw err;
  }

  return botInstance;
}

module.exports = { initBot, getBot: () => botInstance };
