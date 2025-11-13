// WARNING: liveTrader interacts with real funds. This module requires PRIVATE_KEY
const { Wallet, JsonRpcProvider, Contract } = require('ethers');
const { RPC_HTTP, PRIVATE_KEY, LIVE_TRADER, MIN_BUY_USD } = require('../config');
const routerAbi = ['function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) payable returns (uint[] memory amounts)'];

async function buy(tokenAddress, usdAmount){
  if(!LIVE_TRADER) throw new Error('live trading disabled');
  if(!PRIVATE_KEY) throw new Error('PRIVATE_KEY missing');
  const provider = new JsonRpcProvider(RPC_HTTP);
  const wallet = new Wallet(PRIVATE_KEY, provider);
  // NOTE: proper router calls, slippage, gas, and approvals are required — left as exercise
  return { ok:false, reason:'live trader not implemented in scaffold' };
}
module.exports = { buy };
