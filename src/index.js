// src/index.js
require('dotenv').config();
const { startScanner } = require('./scanner');
const { initBot } = require('./telegram/bot');

(async () => {
  const bot = await initBot();
  await startScanner(bot);
})();
