const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { ethers } = require('ethers');

async function createChartImage(pair, points, remoteChartUrl){
  const safe = pair ? pair.replace(/[^a-zA-Z0-9_.-]/g,'_') : `pair_${Date.now()}`;
  const out = path.join(__dirname, '..', 'tmp', `chart_${safe}.png`);
  fs.mkdirSync(path.dirname(out), { recursive: true });

  if (remoteChartUrl){
    try{
      const r = await axios.get(remoteChartUrl, { responseType: 'arraybuffer', timeout: 8000 });
      fs.writeFileSync(out, r.data);
      return out;
    }catch(e){
      // fallback to placeholder
    }
  }

  const txt = `Pair ${pair}\nPrice: ${points[points.length-1].p}`;
  fs.writeFileSync(out, txt);
  return out;
}

async function honeypotCheck(tokenIn, tokenOut, rpcHttp){
  const router = process.env.PANCake_ROUTER;
  if (!router || !rpcHttp || !tokenOut) return false; // cannot check
  try{
    const provider = new ethers.JsonRpcProvider(rpcHttp);
    const abi = ['function getAmountsOut(uint amountIn, address[] memory path) view returns (uint[] memory amounts)'];
    const rC = new ethers.Contract(router, abi, provider);
    const amountIn = ethers.parseUnits('0.001', 18); // small amount
    const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
    const tryPath = [WBNB, tokenOut];
    await rC.getAmountsOut(amountIn, tryPath);
    return false;
  }catch(e){
    return true;
  }
}

async function getTokenMeta(tokenAddress, rpcHttp){
  if (!tokenAddress || !rpcHttp) return null;
  try{
    const provider = new ethers.JsonRpcProvider(rpcHttp);
    const abis = [
      'function totalSupply() view returns (uint256)',
      'function decimals() view returns (uint8)',
      'function symbol() view returns (string)',
      'function name() view returns (string)',
      'function owner() view returns (address)',
      'function balanceOf(address) view returns (uint256)'
    ];
    const c = new ethers.Contract(tokenAddress, abis, provider);
    const [totalSupply, decimals, symbol, name] = await Promise.all([
      c.totalSupply().catch(()=>null),
      c.decimals().catch(()=>18),
      c.symbol().catch(()=>null),
      c.name().catch(()=>null)
    ]);
    let owner = null;
    try{ owner = await c.owner(); }catch(e){}
    let ownerBalance = null;
    if (owner){
      try{ ownerBalance = await c.balanceOf(owner); }catch(e){}
    }
    return {
      totalSupply: totalSupply ? totalSupply.toString() : null,
      decimals,
      symbol,
      name,
      owner,
      ownerBalance: ownerBalance ? ownerBalance.toString() : null
    };
  }catch(e){
    return null;
  }
}

function scoreSignal({ liquidity=0, txs=0, price=0, devShare=0, momentum=0 }){
  let s = 0;
  if (liquidity > 50000) s += 40;
  else if (liquidity > 5000) s += 25;
  else if (liquidity > 500) s += 10;

  if (txs > 500) s += 25;
  else if (txs > 50) s += 10;

  if (price > 0 && price < 0.1) s += 10;
  if (momentum > 0.05) s += 15;
  if (devShare && parseFloat(devShare) > 0.6) s -= 50;

  if (s >= 70) return { label: '🔥 HIGH', score: s };
  if (s >= 40) return { label: '⚠️ MEDIUM', score: s };
  return { label: '💤 LOW', score: s };
}

module.exports = { createChartImage, honeypotCheck, getTokenMeta, scoreSignal };
      
