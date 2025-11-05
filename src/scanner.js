const { fetchTrendingPairs } = require('./dexscreener');
const { createChartImage, honeypotCheck, getTokenMeta, scoreSignal } = require('./utils');
const { ethers } = require('ethers');

const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '7000');
const MIN_LIQ = parseFloat(process.env.MIN_LIQ_BUSD || '10');

let seen = new Set();
let momentum = {};

async function startScanner(tg, logger){
  // Dexscreener polling
  setInterval(async ()=>{
    try{
      const pairs = await fetchTrendingPairs();
      for (const p of pairs){
        const key = p.pair || `${p.token}_${p.price}`;
        if (seen.has(key)) continue;
        seen.add(key);

        if (p.liquidity && p.liquidity < MIN_LIQ) { logger.info('skip low liq', key); continue; }

        // token metadata
        let meta = null;
        if (p.tokenAddress && process.env.RPC_HTTP){
          try{ meta = await getTokenMeta(p.tokenAddress, process.env.RPC_HTTP); }catch(e){ meta = null; }
        }

        // compute dev share if meta available
        let devShare = 0;
        if (meta && meta.owner && meta.ownerBalance && meta.totalSupply){
          try{ devShare = parseFloat(meta.ownerBalance) / parseFloat(meta.totalSupply); }catch(e){ devShare = 0; }
        }

        // momentum: naive compare with previous price
        let mom = 0;
        if (momentum[p.pair]){ mom = (p.price - momentum[p.pair]) / (momentum[p.pair] || p.price || 1); }
        momentum[p.pair] = p.price;

        const score = scoreSignal({ liquidity: p.liquidity, txs: p.txs || 0, price: p.price, devShare, momentum: mom });

        // honeypot check
        let honeypot = false;
        if (process.env.RPC_HTTP && p.baseAddress && p.tokenAddress){
          try{ honeypot = await honeypotCheck(p.tokenAddress, p.baseAddress, process.env.RPC_HTTP); }catch(e){ honeypot = false; }
        }

        const img = await createChartImage(p.pair, [{t:Date.now(), p: p.price}], p.chartUrl);

        await tg.sendSignal({ token0: p.token, token1: p.base, pair: p.pair, liquidity: { totalBUSD: p.liquidity, price: p.price }, honeypot, imgPath: img, scoreLabel: score.label, scoreValue: score.score, raw: Object.assign({}, p, { meta }) });
      }
    }catch(e){ logger.warn('poll err', e.message || e.toString()); }
  }, POLL_INTERVAL);

  // Optional on-chain PairCreated listener (real-time detection)
  if (process.env.PANCake_FACTORY) {
    const wsUrl = process.env.BSC_WS || process.env.RPC_HTTP.replace(/^http/, 'wss');
    try {
      const provider = new ethers.WebSocketProvider(wsUrl);
      const factoryAbi = ['event PairCreated(address indexed token0, address indexed token1, address pair, uint)'];
      const factory = new ethers.Contract(process.env.PANCake_FACTORY, factoryAbi, provider);

      factory.on('PairCreated', async (token0, token1, pair) => {
        logger.info(`[PairCreated] ${pair} | ${token0} ↔ ${token1}`);
        try {
          const tokenMeta = await getTokenMeta(token0, process.env.RPC_HTTP);
          const liq = { totalBUSD: 0, price: 0 };
          const score = scoreSignal({ liquidity: liq.totalBUSD, txs: 0, price: liq.price });
          const img = await createChartImage(pair, [{ t: Date.now(), p: 0 }]);
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
        } catch (e) {
          logger.warn('PairCreated handler failed', e.message);
        }
      });

      provider._websocket.on('close', () => logger.warn('🔌 BSC WS closed, reconnecting soon…'));
      provider._websocket.on('error', err => logger.error('BSC WS error', err.message));
    } catch (e) {
      logger.warn('WebSocket listener disabled →', e.message);
    }
  }
