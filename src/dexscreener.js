const axios = require('axios');

const DEFAULT_LIMIT = parseInt(process.env.DEXSCR_LIMIT || '80');
const MIN_VALID_PRICE = 0.00000001;
const MIN_VALID_LIQUIDITY = parseFloat(process.env.MIN_LIQ_USD || '5');

// DexScreener API endpoints (multi-chain supported)
const CHAINS = [
  'bsc',
  'ethereum',
  'base',
  'solana',
  'arbitrum',
  'avalanche',
];

async function fetchTrendingPairs() {
  const results = [];

  for (const chain of CHAINS) {
    const url = `https://api.dexscreener.com/latest/dex/pairs/${chain}`;

    try {
      const res = await axios.get(url, { timeout: 8000 });

      if (!res.data || !res.data.pairs) continue;

      // Map + filter valid pairs
      const pairs = res.data.pairs
        .filter(
          (p) =>
            parseFloat(p?.priceUsd || p?.price || 0) >= MIN_VALID_PRICE &&
            parseFloat(p?.liquidity?.usd || p?.liquidity_usd || 0) >= MIN_VALID_LIQUIDITY
        )
        .slice(0, DEFAULT_LIMIT)
        .map((p) => ({
          pair: (p.pairAddress || p.pair || '').toLowerCase(),
          token: p.baseToken?.symbol || p.token0?.symbol || p.token?.symbol || 'TOKEN',
          tokenAddress: p.baseToken?.address || p.token0?.address || null,
          base: p.quoteToken?.symbol || p.token1?.symbol || 'BUSD',
          baseAddress: p.quoteToken?.address || p.token1?.address || null,
          chainId: p.chainId || chain,
          liquidity: parseFloat(p.liquidity?.usd || p.liquidity_usd || 0) || 0,
          price: parseFloat(p.priceUsd || p.price || 0) || 0,
          chartUrl: p.url || p.chart || null,
          txs: parseInt(p.txns24h?.buys || p.txCount || 0),
          volume24h: parseFloat(p.volume?.usd24h || 0),
          fdv: parseFloat(p.fdv || 0),
          dexId: p.dexId || 'unknown',
        }));

      results.push(...pairs);
    } catch (err) {
      console.warn(`⚠️ DexScreener fetch failed for ${chain}: ${err.message}`);
    }
  }

  // 🧠 Retry once if all empty
  if (results.length === 0) {
    console.warn('⚠️ All chains returned empty, retrying once...');
    try {
      const res = await axios.get('https://api.dexscreener.com/latest/dex/pairs', { timeout: 8000 });
      if (res.data && res.data.pairs) {
        return res.data.pairs.slice(0, DEFAULT_LIMIT).map((p) => ({
          pair: (p.pairAddress || p.pair || '').toLowerCase(),
          token: p.baseToken?.symbol || p.token0?.symbol || 'TOKEN',
          tokenAddress: p.baseToken?.address || p.token0?.address || null,
          base: p.quoteToken?.symbol || p.token1?.symbol || 'BUSD',
          baseAddress: p.quoteToken?.address || p.token1?.address || null,
          chainId: p.chainId || 'bsc',
          liquidity: parseFloat(p.liquidity?.usd || p.liquidity_usd || 0) || 0,
          price: parseFloat(p.priceUsd || p.price || 0) || 0,
          chartUrl: p.chart || null,
          txs: p.txs_24h || p.txCount || 0,
        }));
      }
    } catch (retryErr) {
      console.error('❌ DexScreener global retry failed:', retryErr.message);
    }
  }

  // Sort highest liquidity first
  const sorted = results.sort((a, b) => b.liquidity - a.liquidity);

  console.log(`✅ DexScreener fetched ${sorted.length} pairs`);
  return sorted;
}

module.exports = { fetchTrendingPairs };
