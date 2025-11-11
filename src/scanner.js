// src/scanner.js
const { fetchTrendingPairs } = require('./dexscreener');
const Web3 = require('web3');
const dotenv = require('dotenv');
dotenv.config();

const FACTORY = process.env.PANCAKE_FACTORY; // PancakeSwap Factory address
const BSC_WS = process.env.BSC_WS;           // optional WebSocket
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '60000');
const MIN_LIQ_BUSD = parseFloat(process.env.MIN_LIQ_BUSD || '30');
const MIN_TXS = parseInt(process.env.MIN_TXS || '5');
const MOMENTUM_MIN = parseFloat(process.env.MOMENTUM_MIN || '0.05');
const MAX_DEV_SHARE = parseFloat(process.env.MAX_DEV_SHARE || '0.2');

let seenPairs = new Set();
let tgBot;

async function startScanner(bot, logger = console) {
  tgBot = bot;
  logger.info('🛰 Initializing Hybrid Memecoin Scanner...');

  // --- 1. On-chain PairCreated listener for NEW tokens ---
  if (BSC_WS) {
    const web3ws = new Web3(new Web3.providers.WebsocketProvider(BSC_WS));
    const factoryContract = new web3ws.eth.Contract(
      [{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"token0","type":"address"},{"indexed":true,"internalType":"address","name":"token1","type":"address"},{"indexed":true,"internalType":"address","name":"pair","type":"address"},{"indexed":false,"internalType":"uint256","name":"","type":"uint256"}],"name":"PairCreated","type":"event"}],
      FACTORY
    );

    factoryContract.events.PairCreated()
      .on('data', async event => {
        const { token0, token1, pair } = event.returnValues;
        if (seenPairs.has(pair)) return;
        seenPairs.add(pair);

        const liquidity = { totalBUSD: 0, price: 0 };
        const raw = {};
        const honeypot = false;
        const scoreLabel = 'New';
        const scoreValue = 100;

        logger.info(`🔹 New pair detected: ${token0}/${token1} (${pair})`);
        await tgBot.sendSignal({ token0, token1, pair, liquidity, honeypot, scoreLabel, scoreValue, raw });
      })
      .on('error', err => logger.error('PairCreated listener error:', err));
  } else {
    logger.warn('⚠️ BSC_WS not configured — PairCreated listener disabled');
  }

  // --- 2. DexScreener polling for existing token momentum ---
  setInterval(async () => {
    try {
      const pairs = await fetchTrendingPairs();

      for (const p of pairs) {
        if (seenPairs.has(p.pair)) continue;

        const devShare = p.devShare || 0;
        if (p.liquidity < MIN_LIQ_BUSD && !(p.txs >= MIN_TXS && p.price * MOMENTUM_MIN > 0)) continue;
        if (devShare > MAX_DEV_SHARE) continue;

        seenPairs.add(p.pair);

        const raw = p;
        const scoreLabel = 'Momentum';
        const scoreValue = Math.round((p.liquidity + (p.volume24h || 0)) / 1000);

        logger.info(`📈 Momentum alert: ${p.token}/${p.base} — $${p.liquidity}`);
        await tgBot.sendSignal({
          token0: p.token,
          token1: p.base,
          pair: p.pair,
          liquidity: { totalBUSD: p.liquidity, price: p.price },
          honeypot: false,
          scoreLabel,
          scoreValue,
          raw,
          imgPath: null
        });
      }
    } catch (err) {
      logger.error('DexScreener polling error:', err.message || err);
    }
  }, POLL_INTERVAL);

  logger.info('✅ Hybrid scanner initialized. Listening for new tokens and momentum spikes...');
}

module.exports = { startScanner };
