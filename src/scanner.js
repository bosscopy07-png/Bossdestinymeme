// src/scanner.js
// Hybrid Sequential Scanner (On-chain PairCreated + GeckoTerminal trending)
// - Sends batches: X trending -> Y new pairs -> repeat
// - Performs liquidity, honeypot, dev-hold checks, scoring, dedupe
// - Persists seenPairs to seen_pairs.json (optional)
// Requirements: env vars PANCAKE_FACTORY, BSC_WS, PANCAKE_ROUTER, BUSD_ADDRESS

const fs = require('fs');
const path = require('path');
const Web3 = require('web3');
const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

/* ------------- Config (via env) ------------- */
const FACTORY = process.env.PANCAKE_FACTORY || '';
const BSC_WS = process.env.BSC_WS || '';
const ROUTER = process.env.PANCAKE_ROUTER || '0x10ED43C718714eb63d5aA57B78B54704E256024E';
const BUSD_ADDRESS = process.env.BUSD_ADDRESS || '';
const MIN_LIQ_BUSD = parseFloat(process.env.MIN_LIQ_BUSD || '20');
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '70000', 10);
const TRENDING_BATCH = parseInt(process.env.TRENDING_BATCH || '3', 10);
const NEWPAIR_BATCH = parseInt(process.env.NEWPAIR_BATCH || '2', 10);
const SEND_COOLDOWN_MS = parseInt(process.env.SEND_COOLDOWN_MS || '1500', 10);
const CYCLE_PAUSE_MS = parseInt(process.env.CYCLE_PAUSE_MS || '2000', 10);
const GECKO_TIMEOUT = parseInt(process.env.GECKO_TIMEOUT || '10000', 10);
const SEEN_PERSIST_PATH = process.env.SEEN_PERSIST_PATH || path.join(__dirname, '..', 'seen_pairs.json');
const MAX_GECKO_RETRY = parseInt(process.env.MAX_GECKO_RETRY || '3', 10);
const GECKO_RETRY_DELAY = parseInt(process.env.GECKO_RETRY_DELAY || '3000', 10);
const SAFE_DECIMALS = 1e18; // assume 18 decimals for common tokens

/* ------------- State ------------- */
let seenPairs = new Set();
let trendingQueue = [];
let newPairsQueue = [];
let tgBot = null;

/* ------------- Persistence helpers ------------- */
function loadSeen() {
  try {
    if (fs.existsSync(SEEN_PERSIST_PATH)) {
      const raw = fs.readFileSync(SEEN_PERSIST_PATH, 'utf8');
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        seenPairs = new Set(arr);
        console.info(`♻️ Loaded ${arr.length} seen pair(s) from disk.`);
      }
    }
  } catch (e) {
    console.warn('⚠️ Could not load seen pairs file:', e.message);
  }
}

function saveSeen() {
  try {
    fs.writeFileSync(SEEN_PERSIST_PATH, JSON.stringify([...seenPairs]), 'utf8');
  } catch (e) {
    console.warn('⚠️ Could not persist seen pairs:', e.message);
  }
}

/* ------------- Utils ------------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const safeFloat = (v, d = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};
const safeInt = (v, d = 0) => {
  const n = parseInt(v);
  return Number.isFinite(n) ? n : d;
};

/* ------------- GeckoTerminal fetch (trending pools) ------------- */
async function fetchGeckoTrending() {
  const chain = 'bsc';
  const url = `https://api.geckoterminal.com/api/v2/networks/${chain}/trending_pools`;
  for (let attempt = 1; attempt <= MAX_GECKO_RETRY; attempt++) {
    try {
      const res = await axios.get(url, { timeout: GECKO_TIMEOUT, headers: { 'User-Agent': 'BossDestinyScanner/1.0' } });
      if (!res.data?.data || !Array.isArray(res.data.data)) return [];
      const tokens = res.data.data.map((pool) => {
        const attrs = pool.attributes || {};
        const base = attrs.base_token || {};
        const quote = attrs.quote_token || {};
        // some attributes may not exist; guard
        const liquidity = safeFloat(attrs.reserve_in_usd, 0);
        const price = safeFloat(attrs.base_token_price_usd, 0);
        const momentum = safeFloat(attrs.price_change_percentage?.h24, 0) / 100;
        return {
          id: pool.id,
          pairAddress: attrs.address,
          token0: base.symbol || 'TOKEN',
          token1: quote.symbol || 'BUSD',
          token0Addr: base.address || null,
          token1Addr: quote.address || null,
          price,
          liquidity,
          momentum,
        };
      });
      return tokens;
    } catch (err) {
      const code = err.response?.status;
      if (code === 429) console.warn(`⚠️ Gecko rate limited (429), attempt ${attempt} — retrying in ${GECKO_RETRY_DELAY}ms`);
      else console.warn(`⚠️ Gecko fetch attempt ${attempt} failed:`, err.message);
      await sleep(GECKO_RETRY_DELAY);
    }
  }
  return [];
}

/* Compatibility wrapper for older imports */
async function fetchTrendingPairs() {
  return await fetchGeckoTrending();
}

/* ------------- On-chain helpers (web3) ------------- */
function createWeb3() {
  if (!BSC_WS) throw new Error('BSC_WS not configured');
  return new Web3(new Web3.providers.WebsocketProvider(BSC_WS, { clientConfig: { keepalive: true } }));
}

const erc20Abi = [
  { constant: true, inputs: [], name: 'totalSupply', outputs: [{ name: '', type: 'uint256' }], type: 'function' },
  { constant: true, inputs: [{ name: '_owner', type: 'address' }], name: 'balanceOf', outputs: [{ name: 'balance', type: 'uint256' }], type: 'function' },
  { constant: true, inputs: [], name: 'decimals', outputs: [{ name: '', type: 'uint8' }], type: 'function' },
];

const pairAbi = [
  { constant: true, inputs: [], name: 'getReserves', outputs: [{ internalType: 'uint112', name: '_reserve0', type: 'uint112' }, { internalType: 'uint112', name: '_reserve1', type: 'uint112' }, { internalType: 'uint32', name: '_blockTimestampLast', type: 'uint32' }], type: 'function' },
  { constant: true, inputs: [], name: 'token0', outputs: [{ internalType: 'address', name: '', type: 'address' }], type: 'function' },
  { constant: true, inputs: [], name: 'token1', outputs: [{ internalType: 'address', name: '', type: 'address' }], type: 'function' },
];

/* get liquidity in BUSD on the LP pair (assumes BUSD in pair) */
async function getLiquidityBUSD(web3, pairAddress) {
  try {
    if (!BUSD_ADDRESS) return 0;
    const pair = new web3.eth.Contract(pairAbi, pairAddress);
    const token0Addr = (await pair.methods.token0().call()).toLowerCase();
    const token1Addr = (await pair.methods.token1().call()).toLowerCase();
    const reserves = await pair.methods.getReserves().call();
    let busdReserve = 0;
    if (token0Addr === BUSD_ADDRESS.toLowerCase()) {
      const decimals = SAFE_DECIMALS; // we work with raw /1e18 by default
      busdReserve = safeFloat(reserves._reserve0) / decimals;
    } else if (token1Addr === BUSD_ADDRESS.toLowerCase()) {
      busdReserve = safeFloat(reserves._reserve1) / SAFE_DECIMALS;
    }
    return busdReserve;
  } catch (e) {
    return 0;
  }
}

/* honeypot check via router.getAmountsOut (read-only) */
async function checkHoneypot(web3, tokenAddress, amountBUSD = 0.1) {
  try {
    if (!BUSD_ADDRESS) return false;
    const router = new web3.eth.Contract(
      [{ constant: false, inputs: [{ internalType: 'uint256', name: 'amountIn', type: 'uint256' }, { internalType: 'address[]', name: 'path', type: 'address[]' }], name: 'getAmountsOut', outputs: [{ internalType: 'uint256[]', name: '', type: 'uint256[]' }], payable: false, stateMutability: 'view', type: 'function' }],
      ROUTER
    );
    const amountIn = Web3.utils.toWei(String(amountBUSD), 'ether'); // amount in wei (we treat BUSD as 18 for call)
    const path = [BUSD_ADDRESS, tokenAddress];
    const amounts = await router.methods.getAmountsOut(amountIn, path).call();
    return safeFloat(amounts[1], 0) > 0;
  } catch (e) {
    // treat failures as possibly honeypot (safer)
    return false;
  }
}

/* dev share = token balance of pair / totalSupply */
async function getDevShare(web3, tokenAddress, pairAddress) {
  try {
    if (!tokenAddress || !pairAddress) return 1;
    const token = new web3.eth.Contract(erc20Abi, tokenAddress);
    const totalSupplyRaw = await token.methods.totalSupply().call();
    const pairBalanceRaw = await token.methods.balanceOf(pairAddress).call();
    const totalSupply = safeFloat(totalSupplyRaw, 0);
    if (totalSupply === 0) return 1;
    const devShare = (safeFloat(pairBalanceRaw, 0) / totalSupply);
    return devShare;
  } catch (e) {
    return 1;
  }
}

/* scoring formula:
   score = min(100, round(momentum*100 + liquidity/10 - devHold*10))
   devHold is percent (0..100) */
function computeScore({ momentum = 0, liquidity = 0, devHold = 0 }) {
  const raw = Math.round((momentum * 100) + (liquidity / 10) - (devHold * 10));
  return Math.max(0, Math.min(100, raw));
}

/* ------------- Core: startScanner (exports) ------------- */
async function startScanner(bot, logger = console) {
  tgBot = bot;
  logger.info('🛰 Starting Hybrid Sequential Scanner (On-chain + GeckoTerminal)');

  // config validations
  if (!FACTORY) logger.warn('⚠️ PANCAKE_FACTORY not set — on-chain listener might fail.');
  if (!BSC_WS) logger.warn('⚠️ BSC_WS not set — on-chain listener will be disabled.');
  if (!BUSD_ADDRESS) logger.warn('⚠️ BUSD_ADDRESS not set — liquidity/honeypot checks may be less accurate.');

  // load persisted seen pairs
  loadSeen();

  // instantiate web3 only if ws provided
  let web3 = null;
  let factoryContract = null;
  if (BSC_WS && FACTORY) {
    try {
      web3 = createWeb3();
      factoryContract = new web3.eth.Contract(
        [{
          anonymous: false,
          inputs: [
            { indexed: true, internalType: 'address', name: 'token0', type: 'address' },
            { indexed: true, internalType: 'address', name: 'token1', type: 'address' },
            { indexed: true, internalType: 'address', name: 'pair', type: 'address' },
          ],
          name: 'PairCreated',
          type: 'event',
        }],
        FACTORY
      );
    } catch (e) {
      logger.error('❌ Could not create web3 or factory contract:', e.message);
      web3 = null;
      factoryContract = null;
    }
  }

  // on-chain listener: push newPairsQueue after checks (but keep checks light to avoid blocking)
  if (factoryContract && web3) {
    factoryContract.events.PairCreated()
      .on('data', async (event) => {
        try {
          const { token0, token1, pair } = event.returnValues;
          if (!pair || seenPairs.has(pair)) return;
          // quick liquidity check using pair reserves
          const liq = await getLiquidityBUSD(web3, pair);
          if (liq < MIN_LIQ_BUSD) {
            logger.debug(`🔹 New pair ${pair} skipped — liquidity ${liq} < ${MIN_LIQ_BUSD}`);
            return;
          }

          // do deeper checks on a background schedule (we still need token addresses for dev share)
          const honeypot = !(await checkHoneypot(web3, token0)) || !(await checkHoneypot(web3, token1));
          const devShare = await getDevShare(web3, token0, pair);
          const devHoldPercent = Number((devShare * 100).toFixed(2));

          // If devShare is extremely large treat as risky (but we still push with penalized score)
          const scoreValue = computeScore({ momentum: 0, liquidity: liq, devHold: devHoldPercent });

          newPairsQueue.push({
            type: 'new',
            token0,
            token1,
            token0Addr: token0,
            token1Addr: token1,
            pair,
            liquidity: liq,
            price: 0,
            momentum: 0,
            devHold: devHoldPercent,
            honeypot,
            scoreLabel: 'New Launch',
            scoreValue,
          });

          // mark seen early to avoid duplicates from other sources
          seenPairs.add(pair);
          saveSeen();
          logger.info(`🆕 Queued new pair ${token0}/${token1} (${pair}) liquidity $${liq.toFixed(2)}`);
        } catch (err) {
          logger.warn('⚠️ PairCreated handler error:', err.message || err);
        }
      })
      .on('error', (err) => {
        logger.error('PairCreated listener error:', err && err.message ? err.message : err);
      });

    logger.info('✅ On-chain PairCreated listener registered.');
  } else {
    logger.warn('⚠️ On-chain PairCreated listener not active (missing BSC_WS or FACTORY).');
  }

  /* --- pollGecko: fetch trending, augment with dev/honeypot checks and push to trendingQueue --- */
  async function pollGeckoAndEnrich() {
    try {
      const tokens = await fetchGeckoTrending();
      if (!tokens || tokens.length === 0) {
        logger.debug('⚠️ No trending tokens returned by GeckoTerminal.');
        return;
      }
      // process each trending token sequentially (to avoid heavy concurrency)
      for (const t of tokens) {
        try {
          // some pools may have no pair or be already seen
          if (!t.pairAddress || seenPairs.has(t.pairAddress)) continue;
          if (t.liquidity < MIN_LIQ_BUSD) continue;

          // do on-chain checks where possible (dev share and honeypot) - requires web3
          let devHold = 0;
          let honeypot = false;
          if (web3) {
            try {
              devHold = Number(((await getDevShare(web3, t.token0Addr, t.pairAddress)) * 100).toFixed(2));
              // check honeypot using token0 (base) path BUSD -> token
              honeypot = !(await checkHoneypot(web3, t.token0Addr));
            } catch (e) {
              // fallback if any check fails
              devHold = 0;
              honeypot = false;
            }
          }

          const scoreValue = computeScore({ momentum: t.momentum, liquidity: t.liquidity, devHold });

          trendingQueue.push({
            type: 'trending',
            token0: t.token0,
            token1: t.token1,
            token0Addr: t.token0Addr,
            token1Addr: t.token1Addr,
            pair: t.pairAddress,
            liquidity: t.liquidity,
            price: t.price,
            momentum: t.momentum,
            devHold,
            honeypot,
            scoreLabel: 'Trending',
            scoreValue,
          });

          // do not mark as globally seen here — wait until it's sent (so trends can re-appear later if needed)
          logger.debug(`🟢 Queued trending ${t.token0} (${t.pairAddress}) L:$${t.liquidity.toFixed(2)} M:${(t.momentum*100).toFixed(2)}% Dev:${devHold}%`);
        } catch (e) {
          logger.warn('⚠️ Enrich trending item failed:', e.message || e);
        }
        // small pause to avoid hitting RPC too fast
        await sleep(200);
      }
    } catch (err) {
      logger.warn('⚠️ pollGeckoAndEnrich failed:', err.message || err);
    }
  }

  /* ------------- Sequential sender loop ------------- */
  async function sequentialSender() {
    logger.info('🔁 Sequential sender loop started.');
    while (true) {
      try {
        // 1) Send up to TRENDING_BATCH trending tokens
        for (let i = 0; i < TRENDING_BATCH && trendingQueue.length; i++) {
          const item = trendingQueue.shift();
          if (!item) break;
          // double-check dedupe
          if (seenPairs.has(item.pair)) {
            logger.debug(`🔁 skipping already-seen trending pair ${item.pair}`);
            continue;
          }

          // if honeypot flagged, we still send but marked as risky
          const isHoneypot = !!item.honeypot;
          const label = item.honeypot ? `${item.scoreLabel} (RISKY)` : item.scoreLabel;

          // send
          await safeSend({
            token0: item.token0,
            token1: item.token1,
            pair: item.pair,
            liquidity: { totalBUSD: item.liquidity, price: item.price || 0 },
            honeypot: isHoneypot,
            scoreLabel: label,
            scoreValue: item.scoreValue,
            raw: item
          }, logger);

          // mark seen and persist
          seenPairs.add(item.pair);
          saveSeen();
          await sleep(SEND_COOLDOWN_MS);
        }

        // 2) Send up to NEWPAIR_BATCH on-chain new pairs
        for (let i = 0; i < NEWPAIR_BATCH && newPairsQueue.length; i++) {
          const item = newPairsQueue.shift();
          if (!item) break;
          if (seenPairs.has(item.pair)) {
            logger.debug(`🔁 skipping already-seen new pair ${item.pair}`);
            continue;
          }

          // If the new pair later shows trending, we'll mark as NEW & TRENDING when it happens
          const label = item.honeypot ? `${item.scoreLabel} (RISKY)` : item.scoreLabel;

          await safeSend({
            token0: item.token0,
            token1: item.token1,
            pair: item.pair,
            liquidity: { totalBUSD: item.liquidity, price: item.price || 0 },
            honeypot: item.honeypot,
            scoreLabel: label,
            scoreValue: item.scoreValue,
            raw: item
          }, logger);

          // mark seen and persist
          seenPairs.add(item.pair);
          saveSeen();
          await sleep(SEND_COOLDOWN_MS);
        }

        // cycle pause
        await sleep(CYCLE_PAUSE_MS);
      } catch (loopErr) {
        logger.error('🔴 sequentialSender loop error:', loopErr && loopErr.message ? loopErr.message : loopErr);
        // small wait before continuing the loop if something exploded
        await sleep(2000);
      }
    }
  }

  /* safeSend wraps tgBot.sendSignal and logs nicely
     it also attempts small fallback if tgBot or sendSignal missing */
  async function safeSend(signal, logger) {
    try {
      if (!tgBot || typeof tgBot.sendSignal !== 'function') {
        logger.warn('⚠️ Telegram bot not initialized or sendSignal missing — skipping send.');
        return;
      }
      // also provide additional metadata to raw for Telegram template
      const enhancedRaw = Object.assign({}, signal.raw || {}, {
        sentAt: new Date().toISOString()
      });
      signal.raw = enhancedRaw;

      await tgBot.sendSignal(signal);
      logger.info(`📨 Sent signal: ${signal.token0}/${signal.token1} (${signal.pair}) score:${signal.scoreValue}`);
    } catch (err) {
      logger.error('❌ safeSend failed:', err && err.message ? err.message : err);
    }
  }

  /* start loop tasks */
  // initial enrich
  await pollGeckoAndEnrich().catch((e) => logger.warn('initial pollGeckoAndEnrich failed', e?.message || e));
  // schedule periodic gecko enrichment
  setInterval(() => {
    pollGeckoAndEnrich().catch((e) => logger.warn('pollGeckoAndEnrich failed', e?.message || e));
  }, POLL_INTERVAL);

  // start sender loop (do not await)
  sequentialSender().catch((e) => logger.error('sequentialSender top-level error', e?.message || e));

  logger.info('✅ Hybrid Sequential Scanner running.');
}

/* ------------- Exports ------------- */
module.exports = {
  startScanner,
  fetchTrendingPairs,
  fetchGeckoTrending,
};
