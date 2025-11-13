const axios = require('axios');
async function fetchGeckoTrending(){
  try{
    const res = await axios.get('https://api.geckoterminal.com/api/v2/networks/bsc/trending_pools', { timeout: 10000 });
    if(!res.data?.data) return [];
    return res.data.data.map(p => {
      const attrs = p.attributes || {};
      const base = attrs.base_token || {};
      const quote = attrs.quote_token || {};
      return {
        type: 'trending',
        pairAddress: attrs.address,
        token0: base.symbol || base.name || 'TOKEN',
        token0Addr: base.address || null,
        token1: quote.symbol || 'BUSD',
        token1Addr: quote.address || null,
        liquidity: Number(attrs.reserve_in_usd) || 0,
        price: Number(attrs.base_token_price_usd) || 0,
        momentum: Number(attrs.price_change_percentage?.h24 || 0)/100
      };
    });
  }catch(e){ return []; }
}
module.exports = { fetchGeckoTrending };
