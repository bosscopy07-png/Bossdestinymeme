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

        // 🟢 / 🔴 Alert style message
        try {
          const isHoneypot = honeypot === true || honeypot === 'yes' || honeypot === 'true';
          const alertEmoji = isHoneypot ? '🔴' : '🟢';
          const alertTitle = isHoneypot ? '⚠️ Possible Honeypot Detected' : '🚀 New Safe Token Detected';

          const liq = p.liquidity || 0;
          const price = p.price || 0;
          const devHold = meta?.ownerBalance && meta?.totalSupply
            ? ((parseFloat(meta.ownerBalance) / parseFloat(meta.totalSupply)) * 100).toFixed(2)
            : 'N/A';

          const payload = Buffer.from(JSON.stringify(p, (_, v) =>
            typeof v === 'bigint' ? v.toString() : v
          )).toString('base64');

          const buyCb = `buy_${payload}`;
          const ignoreCb = `ignore_${p.pair}`;
          const watchCb = `watch_${p.pair}`;

          const msg = `
<b>${alertEmoji} ${alertTitle}</b>

💠 <b>Token:</b> ${p.token}
🔸 <b>Base:</b> ${p.base}
🔗 <b>Pair:</b> <code>${p.pair}</code>

💧 <b>Liquidity:</b> $${liq.toLocaleString(undefined, { maximumFractionDigits: 2 })}
💵 <b>Price:</b> $${price.toFixed(8)}
📈 <b>Momentum:</b> ${(mom * 100).toFixed(2)}%
👤 <b>Dev Holding:</b> ${devHold}%
🧠 <b>Score:</b> ${score.label} (${score.score})
🧨 <b>Honeypot:</b> ${isHoneypot ? '⚠️ YES — RISK!' : '✅ NO — Safe'}

#memecoin #scanner
`;

          const reply_markup = {
            inline_keyboard: [
              [
                { text: '🟢 Paper Buy $10', callback_data: buyCb },
                { text: '🚫 Ignore', callback_data: ignoreCb }
              ],
              [
                { text: '⭐ Add to Watchlist', callback_data: watchCb }
              ]
            ]
          };

          await tg.sendMessage(process.env.TELEGRAM_CHAT_ID, msg, { parse_mode: 'HTML', reply_markup });
          await new Promise(res => setTimeout(res, 500)); // prevent Telegram flood limit
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
          // Minimal real-time alert logic can be added here (similar to above)
        });

        if (provider && provider._websocket) {
          provider._websocket.on('close', (code) => {
            if (logger && logger.warn) logger.warn(`BSC WS closed (code=${code}). Scheduling reconnect in ${reconnectDelay}ms.`);
            cleanupAndReconnect();
          });
          provider._websocket.on('error', (err) => {
            if (logger && logger.error) logger.error('BSC WS error', err?.message || err);
          });
        }

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

    connect().catch((err) => {
      if (logger && logger.warn) logger.warn('Initial BSC WS connect attempt failed', err?.message || err);
      cleanupAndReconnect();
    });
  })();
}

module.exports = { startScanner };
