const { Telegraf } = require('telegraf');
const fs = require('fs');
const { usd } = require('../utils/format');

let bot = null;
function initSender(botToken){
  bot = new Telegraf(botToken);
  return bot.launch().then(()=>bot);
}

async function sendSignalToChat(chatId, payload){
  if(!bot) throw new Error('telegram bot not initialized');
  const msg = `<b>${payload.scoreLabel} ${payload.tokenName} (${payload.tokenSymbol})</b>\n`+
    `Pair: <code>${payload.pair}</code>\n`+
    `Liquidity: ${usd(payload.liquidity)}\nPrice: ${payload.price}\nScore: ${payload.scoreLabel} (${payload.scoreValue})`;
  await bot.telegram.sendMessage(chatId, msg, { parse_mode:'HTML' });
}

module.exports = { initSender, sendSignalToChat };
