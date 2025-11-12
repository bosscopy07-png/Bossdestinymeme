// src/telegram.js
const { Telegraf } = require('telegraf');
const fs = require('fs');
const dotenv = require('dotenv');
const { paperBuy, paperSell, load } = require('./papertrader');
const { fetchGeckoTrending, fetchNewPairs } = require('./scanner');

dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

let bot;
const signalStore = new Map();

async function initTelegram() {
  if (!BOT_TOKEN) throw new Error('❌ TELEGRAM_BOT_TOKEN not set');
  if (!CHAT_ID) console.warn('⚠️ TELEGRAM_CHAT_ID not set — signals won’t deliver!');

  bot = new Telegraf(BOT_TOKEN);

  // Start message
  bot.start(ctx => ctx.reply('🤖 Memecoin Scanner PRO connected and ready ✅'));

  // Error handler
  bot.catch((err, ctx) => {
    console.error('[Telegram Error]', err);
    if (ctx?.update?.message) console.log('Failed message:', ctx.update.message.text);
  });

  // === Inline actions ===
  bot.action(/buy_(.+)/, async ctx => {
    const id = ctx.match[1];
    const payload = signalStore.get(id);
    if (!payload) return await ctx.answerCbQuery('⚠️ Signal not found');
    try {
      const amount = 10;
      const res = await paperBuy(payload, amount);
      await ctx.answerCbQuery(res.ok ? `✅ Paper buy executed: $${amount}` : `❌ Buy failed: ${res.reason}`);
    } catch {
      await ctx.answerCbQuery('⚠️ Buy error');
    }
  });

  bot.action(/sell_(.+)/, async ctx => {
    const id = ctx.match[1];
    const payload = signalStore.get(id);
    if (!payload) return await ctx.answerCbQuery('⚠️ Signal not found');
    try {
      const res = await paperSell(payload.id || 0);
      await ctx.answerCbQuery(res.ok ? '✅ Paper sell executed' : '❌ Sell failed');
    } catch {
      await ctx.answerCbQuery('⚠️ Sell error');
    }
  });

  bot.action(/ignore_(.+)/, async ctx => await ctx.answerCbQuery('🚫 Ignored'));
  bot.action(/watch_(.+)/, async ctx => await ctx.answerCbQuery('⭐ Added to Watchlist'));

  // === Commands ===
  bot.command('balance', async ctx => {
    const db = load();
    await ctx.reply(`💵 Paper Balance: $${(db.balance || 0).toFixed(2)}`);
  });

  bot.command('digest', async ctx => {
    const db = load();
    const top = db.trades
      .slice(-10)
      .reverse()
      .map(t => `${t.side.toUpperCase()} ${t.token} — $${(t.usd || 0).toFixed(2)}`)
      .join('\n') || 'No trades yet';
    await ctx.reply(`📋 Recent Trades:\n${top}`);
  });

  // === Launch Bot ===
  try {
    if (process.env.RENDER === 'true' && process.env.RENDER_EXTERNAL_URL) {
      const domain = process.env.RENDER_EXTERNAL_URL;
      const port = process.env.PORT || 10000;
      await bot.launch({ webhook: { domain, port } });
      console.log(`✅ Telegram bot launched in Webhook mode (${domain}:${port})`);
    } else {
      await bot.launch();
      console.log('✅ Telegram bot launched in Polling mode (local)');
    }
  } catch (err) {
    console.error('❌ Telegram launch failed:', err);
  }

  // === Signal Sender ===
  return {
    sendSignal: async ({ token0, token1, pair, liquidity, honeypot, imgPath, scoreLabel, scoreValue, raw }) => {
      try {
        if (!CHAT_ID) throw new Error('TELEGRAM_CHAT_ID missing');

        const trendingPairs = await fetchGeckoTrending();
        const isTrending = trendingPairs.some(p => p.token0?.toLowerCase() === token0?.toLowerCase());

        const alertEmoji = honeypot ? '🔴' : '🟢';
        const alertTitle = honeypot
          ? '⚠️ Possible Honeypot Detected'
          : isTrending
            ? '🚀 Trending Token Detected'
            : '🌱 New Token Detected';

        const liq = liquidity?.totalBUSD || 0;
        const price = liquidity?.price || 0;
        const devHold =
          raw?.meta?.ownerBalance && raw?.meta?.totalSupply
            ? ((parseFloat(raw.meta.ownerBalance) / parseFloat(raw.meta.totalSupply)) * 100).toFixed(2)
            : 'N/A';

        const msg = `
<b>${alertEmoji} ${alertTitle}</b>

💠 <b>Token:</b> ${token0}
🔸 <b>Base:</b> ${token1}
🔗 <b>Pair:</b> <code>${pair}</code>

💧 <b>Liquidity:</b> $${liq.toLocaleString(undefined, { maximumFractionDigits: 2 })}
💵 <b>Price:</b> $${price.toFixed(8)}
📈 <b>Momentum:</b> ${(raw?.momentum * 100 || 0).toFixed(2)}%
👤 <b>Dev Holding:</b> ${devHold}%
🧠 <b>Score:</b> ${scoreLabel} (${scoreValue})
🧨 <b>Honeypot:</b> ${honeypot ? '⚠️ YES — RISK!' : '✅ NO — Safe'}
${isTrending ? '🔥 This token is trending on GeckoTerminal!' : ''}

#memecoin #scanner
`;

        const id = Math.random().toString(36).substring(2, 12);
        signalStore.set(id, raw || {});

        const reply_markup = {
          inline_keyboard: [
            [
              { text: '🟢 Paper Buy $10', callback_data: `buy_${id}` },
              { text: '🚫 Ignore', callback_data: `ignore_${id}` },
            ],
            [{ text: '⭐ Add to Watchlist', callback_data: `watch_${id}` }],
          ],
        };

        if (imgPath && fs.existsSync(imgPath)) {
          await bot.telegram.sendPhoto(
            CHAT_ID,
            { source: fs.createReadStream(imgPath) },
            { caption: msg, parse_mode: 'HTML', reply_markup }
          );
        } else {
          await bot.telegram.sendMessage(CHAT_ID, msg, { parse_mode: 'HTML', reply_markup });
        }

        await new Promise(r => setTimeout(r, 1500)); // cooldown
      } catch (error) {
        console.error('❌ tg.sendSignal failed:', error.message);
      }
    },
  };
}

// === Hybrid Scanner ===
async function startHybridScanner(sendSignal) {
  const seenPairs = new Set();

  while (true) {
    try {
      console.log("🚀 Fetching trending tokens...");
      const trending = await fetchGeckoTrending();
      const top3 = trending.slice(0, 3);

      for (const t of top3) {
        if (seenPairs.has(t.pairAddress)) continue;
        seenPairs.add(t.pairAddress);
        await sendSignal({
          token0: t.token0,
          token1: t.token1,
          pair: t.pairAddress,
          liquidity: t.liquidity || {},
          honeypot: false,
          scoreLabel: "Trending",
          scoreValue: 85,
          raw: t,
        });
      }

      console.log("🌱 Switching to new on-chain pairs...");
      const newPairs = await fetchNewPairs();
      const topNew = newPairs.slice(0, 2);

      for (const n of topNew) {
        if (seenPairs.has(n.pairAddress)) continue;
        seenPairs.add(n.pairAddress);
        await sendSignal({
          token0: n.token0,
          token1: n.token1,
          pair: n.pairAddress,
          liquidity: n.liquidity || {},
          honeypot: n.honeypot || false,
          scoreLabel: "New Launch",
          scoreValue: 75,
          raw: n,
        });
      }

      console.log("🔁 Cycle complete — restarting...");
      await new Promise(r => setTimeout(r, 8000));
    } catch (err) {
      console.error("⚠️ Hybrid cycle error:", err.message);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

// === Export functions for external use ===
module.exports = { initTelegram, startHybridScanner };
