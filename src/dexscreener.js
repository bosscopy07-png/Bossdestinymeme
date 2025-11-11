const axios = require('axios');

const DEFAULT_LIMIT = parseInt(process.env.DEXSCR_LIMIT || '80');
const MIN_VALID_PRICE = 0.00000001;
const MIN_VALID_LIQUIDITY = parseFloat(process.env.MIN_LIQ_USD || '5');
const MAX_RETRIES = 3; // increased retries for reliability
const RETRY_DELAY_MS = 3000; // 3 seconds
const CHAIN = 'bsc';

// Helper: safe parse float
function safeFloat(val, defaultVal = 0) {
  const f = parseFloat(val);
  return isNaN(f) ? defaultVal : f;
}

// Helper: safe parse int
function safeInt(val, defaultVal = 0) {
  const i = parseInt(val);
  return isNaN(i) ? defaultVal : i;
}

async function fetchTrendingPairs() {
  let results = [];

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const url = `https://api.dexscreener.com/latest/dex/pairs/${CHAIN}`;
      const res = await axios.get(url, { timeout: 8000 });

      if (!res.data || !res.data.pairs) {
        console.warn(`⚠️ Attempt ${attempt}: No data returned from DexScreener`);
        throw new Error('No data in DexScreener response');
      }

      const pairs = res.data.pairs
        .filter(
          (p) =>
            safeFloat(p?.priceUsd || p?.price) >= MIN_VALID_PRICE &&
            safeFloat(p?.liquidity?.usd || p?.liquidity_usd) >= MIN_VALID_LIQUIDITY
        )
        .slice(0, DEFAULT_LIMIT)
        .map((p) => ({
          pair: (p.pairAddress || p.pair || '').toLowerCase(),
          token: p.baseToken?.symbol || p.token0?.symbol || 'TOKEN',
          tokenAddress: p.baseToken?.address || p.token0?.address || null,
          base: p.quoteToken?.symbol || p.token1?.symbol || 'BUSD',
          baseAddress: p.quoteToken?.address || p.token1?.address || null,
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
        console.warn(`⚠️ Attempt ${attempt}: No valid pairs, retrying in ${RETRY_DELAY_MS / 1000}s...`);
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }

      results.push(...pairs);
      break; // successful fetch
    } catch (err) {
      console.error(`❌ Attempt ${attempt}: DexScreener fetch failed for ${CHAIN}:`, err.message);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }

  // Sort by liquidity descending
  results = results.sort((a, b) => b.liquidity - a.liquidity);

  console.log(`✅ DexScreener fetched ${results.length} BSC pairs`);
  if (results.length > 0) {
    console.log(
      '🔝 Top 3 pairs:',
      results
        .slice(0, 3)
        .map((p) => `${p.token}/${p.base} ($${p.liquidity.toFixed(2)})`)
        .join(' | ')
    );
  } else {
    console.warn('⚠️ No valid BSC pairs found after retries.');
  }

  return results;
}

module.exports = { fetchTrendingPairs };
