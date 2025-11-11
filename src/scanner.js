// src/scanner.js
const { fetchTokens } = require('./dexscreener'); // token-based fetch
const Web3 = require('web3');
const dotenv = require('dotenv');
dotenv.config();

const FACTORY = process.env.PANCAKE_FACTORY;
const BSC_WS = process.env.BSC_WS;
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '70000');
const MIN_LIQ_BUSD = parseFloat(process.env.MIN_LIQ_BUSD || '20');
const MIN_TXS = parseInt(process.env.MIN_TXS || '5');
const MOMENTUM_MIN = parseFloat(process.env.MOMENTUM_MIN || '0.05');
const MAX_DEV_SHARE = parseFloat(process.env.MAX_DEV_SHARE || '0.2');

let seenTokens = new Set();
let tgBot;

async function startScanner(bot, logger = console) {
  tgBot = bot;
  logger.info('🛰 Starting Hybrid Token Scanner...');

  // --- 1. On-chain PairCreated listener ---
  if (BSC_WS) {
    const web3ws = new Web3(new Web3.providers.WebsocketProvider(BSC_WS));
    const factoryContract = new web3ws.eth.Contract(
      [
        {
          anonymous: false,
          inputs: [
            { indexed: true, internalType: 'address', name: 'token0', type: 'address' },
            { indexed: true, internalType: 'address', name: 'token1', type: 'address' },
            { indexed: true, internalType: 'address', name: 'pair', type: 'address' },
          ],
          name: 'PairCreated',
          type: 'event',
        },
      ],
      FACTORY
    );

    factoryContract.events.PairCreated()
      .on('data', async (event) => {
        const { token0, token1, pair } = event.returnValues;
        if (seenTokens.has(pair)) return;
        seenTokens.add(pair);

        logger.info(`🆕 New token detected: ${token0}/${token1}`);
        await tgBot.sendSignal({
          token0,
          token1,
          pair,
          liquidity: { totalBUSD: 0, price: 0 },
          honeypot: false,
          scoreLabel: 'New Launch',
          scoreValue: 100,
          raw: {},
        });
      })
      .on('error', (err) => logger.error('PairCreated listener error:', err));
  } else {
    logger.warn('⚠️ BSC_WS not configured — new token listener disabled.');
  }

  // --- 2. DexScreener token polling ---
  const pollTokens = async () => {
    try {
      const tokens = await fetchTokens();

      if (!tokens || tokens.length === 0) {
        logger.warn('⚠️ No trending tokens returned by DexScreener.');
        return;
      }

      for (const t of tokens) {
        if (!t.address || seenTokens.has(t.address)) continue;

        if (t.liquidity < MIN_LIQ_BUSD) continue;
        if (t.txns24h < MIN_TXS) continue;
        if (t.devShare && t.devShare > MAX_DEV_SHARE) continue;

        seenTokens.add(t.address);

        const scoreValue = Math.round((t.volume24h || 0) / 1000 + t.liquidity / 10);
        logger.info(`🚀 Token Alert: ${t.symbol} — $${t.liquidity.toFixed(2)} | Vol: $${(t.volume24h || 0).toFixed(2)}`);

        await tgBot.sendSignal({
          token0: t.symbol,
          token1: 'BUSD',
          pair: t.pairAddress || t.address || 'unknown',
          liquidity: { totalBUSD: t.liquidity, price: t.priceUsd || 0 },
          honeypot: false,
          scoreLabel: 'Trending',
          scoreValue,
          raw: t,
          imgPath: null,
        });
      }
    } catch (err) {
      logger.error('❌ DexScreener token fetch error:', err.message || err);
    }
  };

  // Initial poll
  await pollTokens();
  // Interval polling
  setInterval(pollTokens, POLL_INTERVAL);

  logger.info('✅ Hybrid scanner initialized: Watching new & trending tokens...');
}

module.exports = { startScanner };
