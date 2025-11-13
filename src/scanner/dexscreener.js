const { fetchDexscreener } = require('../utils/dexscreener');
async function enrichWithDex(tokenAddress){
  const data = await fetchDexscreener(tokenAddress);
  if(!data) return null;
  // map minimal useful fields
  return {
    name: data.name || null,
    symbol: data.symbol || null,
    pairs: data.pairs || [],
    metadata: data
  };
}
module.exports = { enrichWithDex };
