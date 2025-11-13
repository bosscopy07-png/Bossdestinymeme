// callback handlers for inline buttons: buy, sell, ignore, watch
const { paperBuy, paperSell } = require('../trader/paperTrader');
module.exports = function registerHandlers(bot, store){
  bot.action(/buy_(.+)/, async ctx => {
    const id = ctx.match[1]; const payload = store.get(id);
    if(!payload) return ctx.answerCbQuery('Signal not found');
    const res = await paperBuy(payload, payload.buyAmount || 1);
    await ctx.answerCbQuery(res.ok? '✅ Paper buy executed':'❌ Buy failed');
  });
  bot.action(/sell_(.+)/, async ctx => {
    const id = ctx.match[1]; const payload = store.get(id);
    if(!payload) return ctx.answerCbQuery('Signal not found');
    const res = await paperSell(payload.id || 0);
    await ctx.answerCbQuery(res.ok? '✅ Paper sell executed':'❌ Sell failed');
  });
};
