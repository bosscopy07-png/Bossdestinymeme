const { initSender } = require('./sender');
const store = new Map();
const { registerHandlers } = require('./handlers');

async function initBot(botToken){
  const bot = await initSender(botToken);
  registerHandlers(bot, store);
  bot.start(ctx=>ctx.reply('Bot ready'));
  return { bot, store };
}

module.exports = { initBot };
