// ==========================================
// Boss Destiny Telegram Memecoin Scanner 🚀
// ==========================================

const express = require('express');
const dotenv = require('dotenv');
const { initTelegram } = require('./telegram');

dotenv.config();

(async () => {
  try {
    // 🟢 Initialize Telegram bot
    console.log('🔄 Starting Telegram Bot...');
    const telegram = await initTelegram();

    // 🧩 Optional: test a startup message
    if (process.env.TELEGRAM_CHAT_ID) {
      try {
        const chatId = process.env.TELEGRAM_CHAT_ID;
        const testMsg = `🤖 <b>Boss Destiny Bot is Live!</b>\n\n✅ Connected and ready to send signals.`;
        const { Telegraf } = require('telegraf');
        const tempBot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
        await tempBot.telegram.sendMessage(chatId, testMsg, { parse_mode: 'HTML' });
        console.log('📨 Sent startup confirmation message.');
      } catch (err) {
        console.warn('⚠️ Could not send startup message:', err.message);
      }
    }

    // ✅ Log bot connection identity
    try {
      const { Telegraf } = require('telegraf');
      const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
      const me = await bot.telegram.getMe();
      console.log(`🤖 Connected as @${me.username}`);
    } catch (err) {
      console.error('⚠️ Telegram connection check failed:', err.message);
    }

  } catch (err) {
    console.error('❌ Bot failed to start:', err.message);
  }
})();

// ==========================================
// 🌐 Keep-alive server for Render hosting
// ==========================================
if (process.env.RENDER === 'true') {
  const app = express();
  const port = process.env.PORT || 10000;

  app.get('/', (req, res) => {
    res.send(`
      <h2>🔥 Boss Destiny Bot is Live 🔥</h2>
      <p>✅ Telegram Memecoin Scanner is active and running.</p>
      <p>Powered by <b>Boss Destiny</b> 👑</p>
    `);
  });

  app.listen(port, () => {
    console.log(`🌐 Keep-alive server running on port ${port}`);
  });
} else {
  console.log('🧩 Running locally — Render keep-alive not needed.');
}
