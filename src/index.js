require('dotenv').config();
const express = require('express');
const winston = require('winston');
const { initTelegram } = require('./telegram');
const { startScanner } = require('./scanner');

const logger = winston.createLogger({ transports: [new winston.transports.Console()] });

(async function main(){
  try{
    logger.info('Starting full Memecoin Scanner...');
    const tg = await initTelegram();
    await startScanner(tg, logger);
  }catch(err){
    logger.error('Fatal', err);
    process.exit(1);
  }
})();

const app = express();
app.get('/', (req, res) => res.send('Memecoin Scanner Full - running'));
app.get('/health', (req, res) => res.json({ ok:true, ts: Date.now() }));
app.get('/dashboard', (req, res) => {
  try{
    const db = require('./papertrader').load();
    res.json({ ok:true, balance: db.balance, trades: db.trades.slice(-20) });
  }catch(e){
    res.json({ ok:false, err: e.message });
  }
});

import axios from "axios";
axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
  chat_id: process.env.TELEGRAM_CHAT_ID,
  text: "🚀 Bot deployed successfully and is now live on Render!",
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> logger.info(`HTTP server listening ${PORT}`));
