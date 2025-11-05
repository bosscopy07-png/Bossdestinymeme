const axios = require('axios');
const DEXSCR_URL = 'https://api.dexscreener.com/latest/dex/pairs';

async function fetchTrendingPairs(){
  try{
    const r = await axios.get(DEXSCR_URL, { timeout: 8000 });
    if (!r.data || !r.data.pairs) return [];
    return r.data.pairs.slice(0, 80).map(p => ({
      pair: (p.pairAddress || p.pair || '').toLowerCase(),
      token: p.baseToken?.symbol || p.token0?.symbol || p.token?.symbol || 'TOKEN',
      tokenAddress: p.baseToken?.address || p.token0?.address || null,
      base: p.quoteToken?.symbol || p.token1?.symbol || p.baseToken?.symbol || 'BUSD',
      baseAddress: p.quoteToken?.address || p.token1?.address || null,
      chainId: p.chainId || 'bsc',
      liquidity: parseFloat(p.liquidity?.usd || p.liquidity_usd || 0) || 0,
      price: parseFloat(p.priceUsd || p.price || 0) || 0,
      chartUrl: p.chart || null,
      txs: p.txs_24h || p.txCount || 0
    }));
  }catch(e){
    return [];
  }
}

module.exports = { fetchTrendingPairs };
