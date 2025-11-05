const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const { paperBuy, paperSell, load } = require('./papertrader');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

let bot;

async function initTelegram(){
  if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN not set');
  bot = new Telegraf(BOT_TOKEN);
  bot.start(ctx => ctx.reply('Memecoin Scanner PRO connected ✅'));

  bot.action(/buy_(.+)/, async ctx => {
    try{
      const payload = JSON.parse(Buffer.from(ctx.match[1], 'base64').toString('utf8'));
      const amount = 10;
      const res = await paperBuy(payload, amount);
      if (res.ok) await ctx.answerCbQuery('Paper buy executed $' + amount);
      else await ctx.answerCbQuery('Buy failed: ' + res.reason);
    }catch(e){ await ctx.answerCbQuery('Buy error'); }
  });

  bot.action(/sell_(\d+)/, async ctx => {
    const id = parseInt(ctx.match[1]);
    const res = await paperSell(id);
    if (res.ok) await ctx.answerCbQuery('Paper sell executed');
    else await ctx.answerCbQuery('Sell failed');
  });

  bot.action(/ignore_(.+)/, async ctx => { await ctx.answerCbQuery('Ignored'); });

  bot.action(/watch_(.+)/, async ctx => { await ctx.answerCbQuery('Added to watchlist (prototype)'); });

  bot.command('balance', async ctx => {
    const db = load();
    await ctx.reply(`Paper Balance: $${(db.balance||0).toFixed(2)}`);
  });

  bot.command('digest', async ctx => {
    const db = require('./papertrader').load();
    const top = db.trades.slice(-10).reverse().map(t=>`${t.side.toUpperCase()} ${t.token} $${(t.usd||0).toFixed(2)}`).join('\n') || 'none';
    await ctx.reply(`Recent trades:\n${top}`);
  });

  await bot.launch({ polling: true }).catch(()=>{});

  return {
    sendSignal: async ({ token0, token1, pair, liquidity, honeypot, imgPath, scoreLabel, scoreValue, raw }) => {
      const msg = `⚡ <b>New Token Detected</b>\nToken: ${token0}\nBase: ${token1}\nPair: ${pair}\nLiquidity: $${((liquidity && liquidity.totalBUSD) || 0).toLocaleString()}\nPrice(USD): ${((liquidity && liquidity.price) || 0)}\nPotential: ${scoreLabel} (${scoreValue})\nHoneypot: ${honeypot ? '⚠️ YES' : '✅ NO'}`;
      const payload = Buffer.from(JSON.stringify(raw || {})).toString('base64');
      const buyCb = `buy_${payload}`;
      const ignoreCb = `ignore_${pair}`;
      const watchCb = `watch_${pair}`;

      if (imgPath && fs.existsSync(imgPath)){
        await bot.telegram.sendPhoto(CHAT_ID, { source: fs.createReadStream(imgPath) }, { caption: msg, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: 'Paper Buy $10', callback_data: buyCb }, { text: 'Ignore', callback_data: ignoreCb }], [{ text: 'Add to Watchlist', callback_data: watchCb }]] }});
      } else {
        await bot.telegram.sendMessage(CHAT_ID, msg, { parse_mode: 'HTML', reply_markup: Markup.inlineKeyboard([[Markup.button.callback('Paper Buy $10', buyCb), Markup.button.callback('Ignore', ignoreCb)], [Markup.button.callback('Add to Watchlist', watchCb)]]) });
      }
    }
  };
}

module.exports = { initTelegram };
    
