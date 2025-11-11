// src/index.js
const { initTelegram } = require('./telegram');
const express = require('express');

console.log('🔄 Starting Boss Destiny Bot...');

(async () => {
  try {
    // Initialize the Telegram bot
    const tg = await initTelegram();

    // ✅ Only add Express keep-alive if Telegram didn't already start it
    if (process.env.RENDER === 'true') {
      const app = express();
      const port = process.env.PORT || 10000;

      app.get('/', (req, res) => res.send('🚀 Boss Destiny Bot is Live ✅'));
      app.get('/health', (req, res) => res.json({ ok: true, timestamp: Date.now() }));

      // Prevent duplicate listen crashes
      const server = app.listen(port, () =>
        console.log(`🌐 Keep-alive server active on port ${port}`)
      );

      server.on('error', err => {
        if (err.code === 'EADDRINUSE') {
          console.log('⚠️ Port in use by Telegram webhook — skipping duplicate Express listen.');
        } else {
          console.error('❌ Express server error:', err);
        }
      });
    }

    // ✅ Optional: send a "bot started" message in your chat
    if (tg && tg.sendSignal && process.env.TELEGRAM_CHAT_ID) {
      await tg.sendSignal({
        token0: 'System',
        token1: 'Online',
        pair: 'BossDestinyBot',
        liquidity: { totalBUSD: 0, price: 0 },
        honeypot: false,
        scoreLabel: 'Startup',
        scoreValue: 100,
        raw: {},
      });
      console.log('📨 Startup signal sent to Telegram.');
    }

    console.log('🤖 Boss Destiny Bot fully operational.');
  } catch (err) {
    console.error('❌ Bot startup failed:', err.message);
  }
})();
