const axios = require('axios');

async function fetchDexscreener(tokenAddress){
  try{
    const url = `https://api.dexscreener.com/tokens/v1/bsc/${tokenAddress}`;
    const r = await axios.get(url, { timeout: 8000 });
    return r.data;
  }catch(e){
    return null;
  }
}

module.exports = { fetchDexscreener };
