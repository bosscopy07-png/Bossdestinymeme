// src/utils.js
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { ethers } = require('ethers');

/**
 * Generate a chart image for a token pair.
 * If remoteChartUrl is provided, it will try to download it.
 * Otherwise, it will create a placeholder text file.
 */
async function createChartImage(pair, points, remoteChartUrl) {
  const safeName = pair ? pair.replace(/[^a-zA-Z0-9_.-]/g, '_') : `pair_${Date.now()}`;
  const outPath = path.join(__dirname, '..', 'tmp', `chart_${safeName}.png`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  if (remoteChartUrl) {
    try {
      const response = await axios.get(remoteChartUrl, { responseType: 'arraybuffer', timeout: 8000 });
      fs.writeFileSync(outPath, response.data);
      return outPath;
    } catch (err) {
      console.warn('⚠️ Failed to fetch remote chart, using placeholder.');
    }
  }

  const placeholderText = `Pair: ${pair}\nPrice: ${points?.[points.length - 1]?.p || 0}`;
  fs.writeFileSync(outPath, placeholderText);
  return outPath;
}

/**
 * Simple honeypot detection using PancakeSwap router.
 * Returns true if the swap fails (possible honeypot).
 */
async function honeypotCheck(tokenIn, tokenOut, rpcHttp) {
  const router = process.env.PANCake_ROUTER;
  if (!router || !rpcHttp || !tokenOut) return false;

  try {
    const provider = new ethers.JsonRpcProvider(rpcHttp);
    const abi = ['function getAmountsOut(uint amountIn, address[] memory path) view returns (uint[] memory amounts)'];
    const routerContract = new ethers.Contract(router, abi, provider);

    const amountIn = ethers.parseUnits('0.001', 18); // test small amount
    const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
    const pathArray = [WBNB, tokenOut];

    await routerContract.getAmountsOut(amountIn, pathArray);
    return false; // swap succeeded, likely safe
  } catch {
    return true; // swap failed, possible honeypot
  }
}

/**
 * Fetch token metadata: total supply, decimals, symbol, name, owner, and owner's balance.
 */
async function getTokenMeta(tokenAddress, rpcHttp) {
  if (!tokenAddress || !rpcHttp) return null;

  try {
    const provider = new ethers.JsonRpcProvider(rpcHttp);
    const abi = [
      'function totalSupply() view returns (uint256)',
      'function decimals() view returns (uint8)',
      'function symbol() view returns (string)',
      'function name() view returns (string)',
      'function owner() view returns (address)',
      'function balanceOf(address) view returns (uint256)',
    ];

    const contract = new ethers.Contract(tokenAddress, abi, provider);
    const [totalSupply, decimals, symbol, name] = await Promise.all([
      contract.totalSupply().catch(() => null),
      contract.decimals().catch(() => 18),
      contract.symbol().catch(() => null),
      contract.name().catch(() => null),
    ]);

    let owner = null;
    let ownerBalance = null;
    try {
      owner = await contract.owner();
      if (owner) ownerBalance = await contract.balanceOf(owner);
    } catch {}

    return {
      totalSupply: totalSupply?.toString() || null,
      decimals,
      symbol,
      name,
      owner,
      ownerBalance: ownerBalance?.toString() || null,
    };
  } catch {
    return null;
  }
}

/**
 * Scores a token signal based on liquidity, transactions, price, dev share, and momentum.
 */
function scoreSignal({ liquidity = 0, txs = 0, price = 0, devShare = 0, momentum = 0 }) {
  let score = 0;

  // Liquidity weighting
  if (liquidity > 50000) score += 40;
  else if (liquidity > 5000) score += 25;
  else if (liquidity > 500) score += 10;

  // Transaction volume weighting
  if (txs > 500) score += 25;
  else if (txs > 50) score += 10;

  // Price and momentum weighting
  if (price > 0 && price < 0.1) score += 10;
  if (momentum > 0.05) score += 15;

  // Penalize high dev ownership
  if (devShare && parseFloat(devShare) > 0.6) score -= 50;

  // Assign label
  if (score >= 70) return { label: '🔥 HIGH', score };
  if (score >= 40) return { label: '⚠️ MEDIUM', score };
  return { label: '💤 LOW', score };
}

module.exports = { createChartImage, honeypotCheck, getTokenMeta, scoreSignal };
