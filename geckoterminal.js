const axios = require('axios');

async function fetchTrendingPairs() {
  const chain = 'bsc';
  const url = `https://api.geckoterminal.com/api/v2/networks/${chain}/trending_pools`;
  let tokens = [];

  try {
    const res = await axios.get(url, { timeout: 10000 });
    if (!res.data?.data) return tokens;

    tokens = res.data.data.map(pool => {
      const attrs = pool.attributes;
      const base = attrs.base_token || {};
      const quote = attrs.quote_token || {};
      return {
        id: pool.id,
        pairAddress: attrs.address,
        token0: base.symbol || 'TOKEN',
        token1: quote.symbol || 'BUSD',
        token0Addr: base.address,
        token1Addr: quote.address,
        price: parseFloat(attrs.base_token_price_usd || 0),
        liquidity: parseFloat(attrs.reserve_in_usd || 0),
        momentum: parseFloat(attrs.price_change_percentage.h24 || 0) / 100,
      };
    });
  } catch (err) {
    console.warn('⚠️ GeckoTerminal fetch failed:', err.message);
  }

  return tokens;
}

module.exports = { fetchTrendingPairs };
