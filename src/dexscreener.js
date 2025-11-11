const axios = require('axios');

const DEFAULT_LIMIT = parseInt(process.env.DEXSCR_LIMIT || '80');
const MIN_VALID_PRICE = 0.00000001;
const MIN_VALID_LIQUIDITY = parseFloat(process.env.MIN_LIQ_USD || '30');
const MAX_RETRIES = 5; // retry more times for 429
const RETRY_DELAY_MS = 3000; // 3s
const CHAIN = 'bsc';

// Cache last good results
let lastPairs = [];

function safeFloat(val, defaultVal = 0) {
  const f = parseFloat(val);
  return isNaN(f) ? defaultVal : f;
}

function safeInt(val, defaultVal = 0) {
  const i = parseInt(val);
  return isNaN(i) ? defaultVal : i;
}

async function fetchTrendingPairs() {
  let results = [];
  let backoff = RETRY_DELAY_MS;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const url = `https://api.dexscreener.com/latest/dex/tokens?chain=${CHAIN}`;
      const res = await axios.get(url, { timeout: 8000 });

      if (!res.data || !res.data.tokens) {
        console.warn(`⚠️ Attempt ${attempt}: No data returned from DexScreener`);
        throw new Error('No data in DexScreener response');
      }

      const pairs = res.data.tokens
        .filter(
          (p) =>
            safeFloat(p?.priceUsd || p?.price) >= MIN_VALID_PRICE &&
            safeFloat(p?.liquidity?.usd || p?.liquidity_usd) >= MIN_VALID_LIQUIDITY
        )
        .slice(0, DEFAULT_LIMIT)
        .map((p) => ({
          pair: (p.pairAddress || p.pair || '').toLowerCase(),
          token: p.symbol || 'TOKEN',
          tokenAddress: p.address || null,
          base: p.baseToken?.symbol || 'BUSD',
          baseAddress: p.baseToken?.address || null,
          chainId: CHAIN,
          liquidity: safeFloat(p.liquidity?.usd || p.liquidity_usd),
          price: safeFloat(p.priceUsd || p.price),
          chartUrl: p.url || p.chart || null,
          txs: safeInt(p.txns24h?.buys || p.txCount),
          volume24h: safeFloat(p.volume?.usd24h),
          fdv: safeFloat(p.fdv),
          dexId: p.dexId || 'unknown',
        }));

      if (pairs.length === 0) {
        console.warn(`⚠️ Attempt ${attempt}: No valid pairs, retrying in ${backoff / 1000}s...`);
        await new Promise((r) => setTimeout(r, backoff));
        backoff *= 2; // exponential backoff for 429
        continue;
      }

      results.push(...pairs);
      lastPairs = pairs; // cache last good pairs
      break;
    } catch (err) {
      if (err.response?.status === 429) {
        console.warn(`⚠️ Attempt ${attempt}: Rate limited, backing off ${backoff / 1000}s`);
        await new Promise((r) => setTimeout(r, backoff));
        backoff *= 2;
      } else {
        console.error(`❌ Attempt ${attempt}: DexScreener fetch failed:`, err.message);
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }

  if (results.length === 0 && lastPairs.length > 0) {
    console.log('⚠️ Using cached pairs due to fetch failures');
    results = lastPairs;
  }

  results = results.sort((a, b) => b.liquidity - a.liquidity);

  console.log(`✅ DexScreener fetched ${results.length} BSC tokens`);
  if (results.length > 0) {
    console.log(
      '🔝 Top 3 tokens:',
      results
        .slice(0, 3)
        .map((p) => `${p.token}/${p.base} ($${p.liquidity.toFixed(2)})`)
        .join(' | ')
    );
  } else {
    console.warn('⚠️ No valid BSC tokens found after retries.');
  }

  return results;
}

module.exports = { fetchTrendingPairs };
