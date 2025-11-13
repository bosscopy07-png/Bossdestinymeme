const { fetchGeckoTrending } = require('./gecko');
const { listenForPairs } = require('./onpair');
const { enrichWithDex } = require('./dexscreener');
const { enrich } = require('../signals/processor');
const { generatePayload } = require('../signals/generator');
const { initBot } = require('../telegram/bot');
const { startScanner: startScannerFromScanner } = require('./index');
const config = require('../config');

// Orchestrator: brings scanning pieces together and pushes signals to Telegram
async function run(logger = console){
  const { bot, store } = await initBot(process.env.TELEGRAM_BOT_TOKEN);
  // gecko loop
  setInterval(async ()=>{
    try{
      const trending = await fetchGeckoTrending();
      for(const t of trending.slice(0, config.TRENDING_BATCH)){
        const s = await enrich(t);
        const payload = generatePayload(s);
        store.set(payload.id, payload);
        await bot.telegram.sendMessage(process.env.TELEGRAM_CHAT_ID, `🔥 ${payload.tokenName} — ${payload.pair}`);
      }
    }catch(e){ logger.warn('gecko loop', e.message); }
  }, config.POLL_INTERVAL);

  // onpair listener
  listenForPairs(async (p)=>{
    try{
      const s = await enrich(p);
      const payload = generatePayload(s);
      store.set(payload.id, payload);
      await bot.telegram.sendMessage(process.env.TELEGRAM_CHAT_ID, `🌱 New ${payload.tokenName} — ${payload.pair}`);
    }catch(e){ logger.warn('onpair deliver', e.message); }
  }, console);
}
module.exports = { run };
