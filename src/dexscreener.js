const axios = require('axios');

const DEFAULT_LIMIT = parseInt(process.env.DEXSCR_LIMIT || '80');
const MIN_VALID_PRICE = 0.00000001;
const MIN_VALID_LIQUIDITY = parseFloat(process.env.MIN_LIQ_USD || '5');
const MAX_RETRIES = 2; // retry count
const RETRY_DELAY_MS = 3000; // 3 seconds

// Only BSC chain
const CHAIN = 'bsc';

async function fetchTrendingPairs() {
  let results = [];
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    attempt++;
    try {
      const url = `https://api.dexscreener.com/latest/dex/pairs/${CHAIN}`;
      const res = await axios.get(url, { timeout: 8000 });

      if (res.data && res.data.pairs) {
        const pairs = res.data.pairs
          .filter(
            (p) =>
              parseFloat(p?.priceUsd || p?.price || 0) >= MIN_VALID_PRICE &&
              parseFloat(p?.liquidity?.usd || p?.liquidity_usd || 0) >= MIN_VALID_LIQUIDITY
          )
          .slice(0, DEFAULT_LIMIT)
          .map((p) => ({
            pair: (p.pairAddress || p.pair || '').toLowerCase(),
            token: p.baseToken?.symbol || p.token0?.symbol || 'TOKEN',
            tokenAddress: p.baseToken?.address || p.token0?.address || null,
            base: p.quoteToken?.symbol || p.token1?.symbol || 'BUSD',
            baseAddress: p.quoteToken?.address || p.token1?.address || null,
            chainId: CHAIN,
            liquidity: parseFloat(p.liquidity?.usd || p.liquidity_usd || 0) || 0,
            price: parseFloat(p.priceUsd || p.price || 0) || 0,
            chartUrl: p.url || p.chart || null,
            txs: parseInt(p.txns24h?.buys || p.txCount || 0),
            volume24h: parseFloat(p.volume?.usd24h || 0),
            fdv: parseFloat(p.fdv || 0),
            dexId: p.dexId || 'unknown',
          }));

        results.push(...pairs);
      }

      if (results.length > 0) break; // exit retry loop if we got pairs
      console.warn(`⚠️ Attempt ${attempt}: No valid BSC pairs fetched, retrying in ${RETRY_DELAY_MS / 1000}s...`);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    } catch (err) {
      console.error(`❌ Attempt ${attempt}: DexScreener fetch failed for ${CHAIN}:`, err.message);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }

  // Sort highest liquidity first
  results = results.sort((a, b) => b.liquidity - a.liquidity);

  console.log(`✅ DexScreener fetched ${results.length} BSC pairs`);
  if (results.length > 0) {
    console.log('🔝 Top 3 pairs:', results.slice(0, 3).map(p => `${p.token}/${p.base} ($${p.liquidity})`).join(' | '));
  } else {
    console.warn('⚠️ No valid BSC pairs found after retries.');
  }

  return results;
}

module.exports = { fetchTrendingPairs };
