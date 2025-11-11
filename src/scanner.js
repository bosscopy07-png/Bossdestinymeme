// src/scanner.js
const { fetchTrendingPairs } = require('./dexscreener');
const { initTelegram } = require('./telegram');
const Web3 = require('web3');
const dotenv = require('dotenv');
dotenv.config();

const FACTORY = process.env.PANCAKE_FACTORY; // PancakeSwap Factory address
const RPC_HTTP = process.env.RPC_HTTP;       // BSC RPC
const BSC_WS = process.env.BSC_WS;           // optional WebSocket
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '60000');
const MIN_LIQ_BUSD = parseFloat(process.env.MIN_LIQ_BUSD || '30');
const MIN_TXS = parseInt(process.env.MIN_TXS || '5');
const MOMENTUM_MIN = parseFloat(process.env.MOMENTUM_MIN || '0.05');
const MAX_DEV_SHARE = parseFloat(process.env.MAX_DEV_SHARE || '0.6');

let seenPairs = new Set();
let tgBot;

async function initScanner(bot) {
  tgBot = bot;
  console.log('🛰 Initializing Hybrid Memecoin Scanner...');

  // --- 1. On-chain PairCreated listener for NEW tokens ---
  if (BSC_WS) {
    const web3ws = new Web3(new Web3.providers.WebsocketProvider(BSC_WS));
    const factoryContract = new web3ws.eth.Contract(
      [{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"token0","type":"address"},{"indexed":true,"internalType":"address","name":"token1","type":"address"},{"indexed":true,"internalType":"address","name":"pair","type":"address"},{"indexed":false,"internalType":"uint256","name":"","type":"uint256"}],"name":"PairCreated","type":"event"}],
      FACTORY
    );

    factoryContract.events.PairCreated()
      .on('data', async event => {
        const token0 = event.returnValues.token0;
        const token1 = event.returnValues.token1;
        const pair = event.returnValues.pair;

        if (seenPairs.has(pair)) return;
        seenPairs.add(pair);

        // Quick meta check
        const liquidity = { totalBUSD: 0, price: 0 }; // optional: add RPC call to get real liquidity
        const raw = {}; // add raw token info if needed
        const honeypot = false; // optional: call honeypot checker
        const scoreLabel = 'New';
        const scoreValue = 100;

        console.log(`🔹 New pair detected: ${token0}/${token1} (${pair})`);
        await tgBot.sendSignal({ token0, token1, pair, liquidity, honeypot, scoreLabel, scoreValue, raw });
      })
      .on('error', err => console.error('PairCreated listener error:', err));
  } else {
    console.warn('⚠️ BSC_WS not configured — PairCreated listener disabled');
  }

  // --- 2. DexScreener polling for existing token momentum ---
  setInterval(async () => {
    const pairs = await fetchTrendingPairs();

    for (const p of pairs) {
      if (seenPairs.has(p.pair)) continue; // skip already alerted tokens

      // Calculate a simple score / filter
      const devShare = p.devShare || 0; // if available from metadata
      if (p.liquidity < MIN_LIQ_BUSD && !(p.txs >= MIN_TXS && p.price * MOMENTUM_MIN > 0)) continue;
      if (devShare > MAX_DEV_SHARE) continue;

      seenPairs.add(p.pair);

      const raw = p; // pass the full pair object
      const scoreLabel = 'Momentum';
      const scoreValue = Math.round((p.liquidity + (p.volume24h || 0)) / 1000);

      console.log(`📈 Momentum alert: ${p.token}/${p.base} — $${p.liquidity}`);
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
  }, POLL_INTERVAL);

  console.log('✅ Hybrid scanner initialized. Listening for new tokens and momentum spikes...');
}

module.exports = { initScanner };
