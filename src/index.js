// ==========================================
// Boss Destiny Telegram Memecoin Scanner 🚀
// ==========================================

const express = require('express');
const dotenv = require('dotenv');
const { initTelegram } = require('./telegram');

dotenv.config();

(async () => {
  try {
    console.log('🔄 Starting Telegram Bot...');

    // Start Telegram bot first
    const telegram = await initTelegram();

    // Optional: test startup message
    if (process.env.TELEGRAM_CHAT_ID) {
      const { Telegraf } = require('telegraf');
      const tempBot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
      await tempBot.telegram.sendMessage(
        process.env.TELEGRAM_CHAT_ID,
        '🤖 <b>Boss Destiny Bot is Live and Ready!</b>',
        { parse_mode: 'HTML' }
      );
      console.log('📨 Sent startup confirmation message.');
    }

    // ✅ Log bot connection identity
    const { Telegraf } = require('telegraf');
    const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
    const me = await bot.telegram.getMe();
    console.log(`🤖 Connected as @${me.username}`);

    // ✅ Start express server only once
    const app = express();
    const port = process.env.PORT || 10000;

    app.get('/', (req, res) => {
      res.send(`
        <h2>🔥 Boss Destiny Bot is Live 🔥</h2>
        <p>✅ Telegram Memecoin Scanner is active.</p>
        <p>Powered by <b>Boss Destiny</b> 👑</p>
      `);
    });

    app.listen(port, () => {
      console.log(`🌐 Keep-alive server running on port ${port}`);
    });

  } catch (err) {
    console.error('❌ Bot failed to start:', err.message);
  }
})();
