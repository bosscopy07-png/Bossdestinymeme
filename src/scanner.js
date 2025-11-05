// src/scanner.js
const { fetchTrendingPairs } = require('./dexscreener');
const { createChartImage, honeypotCheck, getTokenMeta, scoreSignal } = require('./utils');
const { ethers } = require('ethers');

const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '7000');
const MIN_LIQ = parseFloat(process.env.MIN_LIQ_BUSD || '10');

let seen = new Set();
let momentum = {};

/**
 * startScanner(tg, logger)
 * - tg: object returned from initTelegram() (has sendSignal)
 * - logger: a logger (winston) instance
 */
async function startScanner(tg, logger) {
  // Dexscreener polling
  setInterval(async () => {
    try {
      const pairs = await fetchTrendingPairs();
      for (const p of pairs) {
        const key = p.pair || `${p.token}_${p.price}`;
        if (seen.has(key)) continue;
        seen.add(key);

        if (p.liquidity && p.liquidity < MIN_LIQ) {
          if (logger && logger.info) logger.info('skip low liq', key);
          continue;
        }

        // token metadata
        let meta = null;
        if (p.tokenAddress && process.env.RPC_HTTP) {
          try { meta = await getTokenMeta(p.tokenAddress, process.env.RPC_HTTP); } catch (e) { meta = null; }
        }

        // compute dev share if meta available
        let devShare = 0;
        if (meta && meta.owner && meta.ownerBalance && meta.totalSupply) {
          try { devShare = parseFloat(meta.ownerBalance) / parseFloat(meta.totalSupply); } catch (e) { devShare = 0; }
        }

        // momentum: naive compare with previous price
        let mom = 0;
        try {
          if (momentum[p.pair]) { mom = (p.price - momentum[p.pair]) / (momentum[p.pair] || p.price || 1); }
        } catch (e) { mom = 0; }
        momentum[p.pair] = p.price;

        const score = scoreSignal({ liquidity: p.liquidity, txs: p.txs || 0, price: p.price, devShare, momentum: mom });

        // honeypot check
        let honeypot = false;
        if (process.env.RPC_HTTP && p.baseAddress && p.tokenAddress) {
          try { honeypot = await honeypotCheck(p.tokenAddress, p.baseAddress, process.env.RPC_HTTP); } catch (e) { honeypot = false; }
        }

        const img = await createChartImage(p.pair, [{ t: Date.now(), p: p.price }], p.chartUrl);

        try {
          await tg.sendSignal({
            token0: p.token,
            token1: p.base,
            pair: p.pair,
            liquidity: { totalBUSD: p.liquidity, price: p.price },
            honeypot,
            imgPath: img,
            scoreLabel: score.label,
            scoreValue: score.score,
            raw: Object.assign({}, p, { meta })
          });
        } catch (e) {
          if (logger && logger.warn) logger.warn('sendSignal failed', e.message || e);
        }
      }
    } catch (e) {
      if (logger && logger.warn) logger.warn('poll err', e.message || e.toString());
    }
  }, POLL_INTERVAL);

  // Optional on-chain PairCreated listener (real-time detection with auto-reconnect)
  (function enablePairCreatedListener() {
    const factoryAddr = process.env.PANCAKE_FACTORY;
    if (!factoryAddr) {
      if (logger && logger.warn) logger.warn('PANCAKE_FACTORY not set — skipping on-chain PairCreated listener');
      return;
    }

    const wsFromEnv = process.env.BSC_WS;
    const rpcHttp = process.env.RPC_HTTP || process.env.BSC_RPC || null;
    const derivedWs = rpcHttp ? rpcHttp.replace(/^http/, 'wss') : null;
    const WS_URL = wsFromEnv || derivedWs;

    if (!WS_URL) {
      if (logger && logger.warn) logger.warn('No WebSocket URL available (set BSC_WS or RPC_HTTP). Skipping on-chain listener.');
      return;
    }

    let provider = null;
    let factory = null;
    let reconnectDelay = 3000; // start 3s
    const MAX_DELAY = 60000; // cap 60s

    async function connect() {
      try {
        if (logger && logger.info) logger.info(`Attempting BSC WS connect -> ${WS_URL}`);
        provider = new ethers.WebSocketProvider(WS_URL);

        const factoryAbi = ['event PairCreated(address indexed token0, address indexed token1, address pair, uint)'];
        factory = new ethers.Contract(factoryAddr, factoryAbi, provider);

        factory.on('PairCreated', async (token0, token1, pair) => {
          if (logger && logger.info) logger.info(`[PairCreated] ${pair} | ${token0} ↔ ${token1}`);
          try {
            let tokenMeta = null;
            try { tokenMeta = await getTokenMeta(token0, process.env.RPC_HTTP); } catch (e) { tokenMeta = null; }

            const liq = { totalBUSD: 0, price: 0 };
            const score = scoreSignal({ liquidity: liq.totalBUSD, txs: 0, price: liq.price });
            const img = await createChartImage(pair, [{ t: Date.now(), p: liq.price }]);

            try {
              await tg.sendSignal({
                token0: tokenMeta?.symbol || token0,
                token1,
                pair,
                liquidity: liq,
                honeypot: false,
                imgPath: img,
                scoreLabel: score.label,
                scoreValue: score.score,
                raw: { token0, token1, pair, tokenMeta }
              });
            } catch (err) {
              if (logger && logger.warn) logger.warn('tg.sendSignal failed', err.message || err);
            }
          } catch (err) {
            if (logger && logger.warn) logger.warn('PairCreated handler error', err.message || err);
          }
        });

        if (provider && provider._websocket) {
          provider._websocket.on('close', (code) => {
            if (logger && logger.warn) logger.warn(`BSC WS closed (code=${code}). Scheduling reconnect in ${reconnectDelay}ms.`);
            cleanupAndReconnect();
          });
          provider._websocket.on('error', (err) => {
            if (logger && logger.error) logger.error('BSC WS error', err?.message || err);
            // close will trigger reconnect
          });
        }

        // reset reconnect delay on successful connect
        reconnectDelay = 3000;
        if (logger && logger.info) logger.info('BSC WebSocket listener connected.');
      } catch (err) {
        if (logger && logger.warn) logger.warn('BSC WS connect failed:', err?.message || err);
        cleanupAndReconnect();
      }
    }

    function cleanupAndReconnect() {
      try { if (factory && typeof factory.removeAllListeners === 'function') factory.removeAllListeners(); } catch (e) {}
      try { if (provider && provider._websocket) provider._websocket.terminate(); } catch (e) {}
      try { if (provider && typeof provider.destroy === 'function') provider.destroy(); } catch (e) {}
      provider = null;
      factory = null;

      setTimeout(() => {
        reconnectDelay = Math.min(MAX_DELAY, Math.floor(reconnectDelay * 1.8));
        connect().catch(() => {});
      }, reconnectDelay);
    }

    // start initial connect
    connect().catch((err) => {
      if (logger && logger.warn) logger.warn('Initial BSC WS connect attempt failed', err?.message || err);
      cleanupAndReconnect();
    });
  })();
}

module.exports = { startScanner };
